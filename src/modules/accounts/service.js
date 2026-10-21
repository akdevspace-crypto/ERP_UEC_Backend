import { prisma } from '../../app/prisma.js';
import { generateRefNumber as generateRef } from '../../shared/utils/refGenerator.js';
import { AnomalyEngine } from '../../intelligence/services/anomaly.engine.js';
import { ensurePatientBillingTables, postAccountInvoiceToPatientLedger, reconcileAllocationCompletionBilling } from '../patient_billing/ledger.js';

const buildTransactionMetadata = (anomalyResult) => {
    if (!anomalyResult?.isAnomaly) return null;

    return {
        aiAnomalies: anomalyResult.anomalies,
        aiAnomalyScore: anomalyResult.score
    };
};

const buildMetadata = (data, anomalyResult) => {
    const anomalyMetadata = buildTransactionMetadata(anomalyResult);
    return anomalyMetadata ? { ...data, ...anomalyMetadata } : data;
};

const extractAllocationIdFromTask = (task) => {
    const match = String(task?.description || '').match(/Allocation:([0-9a-f-]{36})/i);
    return match?.[1] || null;
};

const nextInvoiceRef = async (tx, tenantId, unitId) => {
    const counter = await tx.refCounter.upsert({
        where: {
            prefix_tenantId: {
                prefix: 'INV',
                tenantId
            }
        },
        update: { current: { increment: 1 } },
        create: {
            prefix: 'INV',
            current: 1,
            tenantId,
            unitId
        }
    });

    return `INV-${String(counter.current).padStart(6, '0')}`;
};

const resolveServiceAmount = (allocation) => {
    const rawAmount = allocation.metadata?.readyToPayAmount
        || allocation.enquiry?.readyToPayAmount
        || allocation.enquiry?.service?.price
        || 0;
    const amount = Number(rawAmount);
    return Number.isFinite(amount) ? amount : 0;
};

export const createInvoiceDraftForApprovedDuty = async (tx, task, allocation) => {
    const existingInvoice = await tx.accountTransaction.findFirst({
        where: {
            allocationId: allocation.id,
            type: 'INVOICE',
            tenantId: task.tenantId,
            unitId: task.unitId,
            isDeleted: false
        },
        select: { id: true }
    });

    if (existingInvoice) return false;

    const invoice = await tx.accountTransaction.create({
        data: {
            refNo: await nextInvoiceRef(tx, task.tenantId, task.unitId),
            allocationId: allocation.id,
            type: 'INVOICE',
            amount: resolveServiceAmount(allocation),
            paymentMode: allocation.enquiry?.paymentMode || allocation.metadata?.paymentMode || null,
            category: allocation.enquiry?.service?.name || `${String(allocation.type || 'Service').replace(/_/g, ' ')} Care`,
            clientName: allocation.enquiry?.client?.name || allocation.metadata?.patientName || 'Client',
            notes: `Auto-drafted from approved duty ${task.refNo}`,
            status: 'CREATED',
            date: task.completedAt || new Date(),
            metadata: {
                source: 'APPROVED_SERVICE_DUTY_RECONCILE',
                allocationId: allocation.id,
                allocationRef: allocation.refNo,
                taskId: task.id,
                taskRefNo: task.refNo,
                patientName: allocation.metadata?.patientName || allocation.enquiry?.client?.name || null,
                serviceDeliveredAt: task.completedAt || null
            },
            tenantId: task.tenantId,
            unitId: task.unitId
        }
    });
    await postAccountInvoiceToPatientLedger(tx, invoice);

    return true;
};

const createInvoiceDraftForCompletedAllocation = async (tx, allocation) => {
    const existingInvoice = await tx.accountTransaction.findFirst({
        where: {
            allocationId: allocation.id,
            type: 'INVOICE',
            tenantId: allocation.tenantId,
            unitId: allocation.unitId,
            isDeleted: false
        },
        select: { id: true }
    });

    if (existingInvoice) return false;

    const metadata = allocation.metadata && typeof allocation.metadata === 'object' ? allocation.metadata : {};
    const serviceHistory = Array.isArray(metadata.serviceHistory) ? metadata.serviceHistory : [];
    const latestService = serviceHistory[0] || {};

    const invoice = await tx.accountTransaction.create({
        data: {
            refNo: await nextInvoiceRef(tx, allocation.tenantId, allocation.unitId),
            allocationId: allocation.id,
            type: 'INVOICE',
            amount: resolveServiceAmount(allocation),
            paymentMode: allocation.enquiry?.paymentMode || metadata.paymentMode || null,
            category: allocation.enquiry?.service?.name || `${String(allocation.type || 'Service').replace(/_/g, ' ')} Care`,
            clientName: allocation.enquiry?.client?.name || metadata.patientName || 'Client',
            notes: `Auto-drafted from completed service ${allocation.refNo}`,
            status: 'CREATED',
            date: metadata.serviceDeliveredAt ? new Date(metadata.serviceDeliveredAt) : allocation.endDate || new Date(),
            metadata: {
                source: 'COMPLETED_SERVICE_RECONCILE',
                allocationId: allocation.id,
                allocationRef: allocation.refNo,
                taskId: latestService.taskId || metadata.serviceDeliveredByTaskId || null,
                taskRefNo: latestService.taskRefNo || metadata.lastApprovedDutyTaskRef || null,
                patientName: metadata.patientName || allocation.enquiry?.client?.name || null,
                serviceDeliveredAt: metadata.serviceDeliveredAt || latestService.completedAt || latestService.approvedAt || null
            },
            tenantId: allocation.tenantId,
            unitId: allocation.unitId
        }
    });
    await postAccountInvoiceToPatientLedger(tx, invoice);

    return true;
};

export const reconcileMissingServiceInvoices = async (tenantId, unitId) => {
    await ensurePatientBillingTables();

    const where = {
        tenantId,
        isDeleted: false,
        status: 'APPROVED',
        description: { contains: 'Allocation:' }
    };

    if (unitId && unitId !== 'ALL') {
        where.unitId = unitId;
    }

    const approvedDuties = await prisma.task.findMany({
        where,
        take: 50,
        orderBy: { updatedAt: 'desc' },
        select: {
            id: true,
            refNo: true,
            description: true,
            completedAt: true,
            tenantId: true,
            unitId: true
        }
    });

    const dutyAllocationIds = approvedDuties.map(extractAllocationIdFromTask).filter(Boolean);
    const existingDutyInvoices = dutyAllocationIds.length ? await prisma.accountTransaction.findMany({
        where: { allocationId: { in: dutyAllocationIds }, type: 'INVOICE', tenantId, isDeleted: false },
        select: { allocationId: true }
    }) : [];
    const existingDutyAllocationIds = new Set(existingDutyInvoices.map(i => i.allocationId).filter(Boolean));
    const pendingDutyAllocationIds = dutyAllocationIds.filter(id => !existingDutyAllocationIds.has(id));

    if (pendingDutyAllocationIds.length > 0) {
        const allocations = await prisma.allocation.findMany({
            where: { id: { in: pendingDutyAllocationIds }, tenantId, isDeleted: false },
            include: { enquiry: { include: { client: true, service: true } } }
        });
        const allocationMap = new Map(allocations.map(a => [a.id, a]));

        for (const task of approvedDuties) {
            const allocationId = extractAllocationIdFromTask(task);
            if (!allocationId || existingDutyAllocationIds.has(allocationId)) continue;
            const allocation = allocationMap.get(allocationId);
            if (!allocation) continue;

            try {
                await createInvoiceDraftForApprovedDuty(prisma, task, allocation);
            } catch (error) {
                console.warn('Approved duty invoice reconciliation skipped:', error?.message || error);
            }
        }
    }

    const allocationWhere = {
        tenantId,
        isDeleted: false,
        status: 'COMPLETED'
    };

    if (unitId && unitId !== 'ALL') {
        allocationWhere.unitId = unitId;
    }

    const completedAllocations = await prisma.allocation.findMany({
        where: allocationWhere,
        take: 50,
        orderBy: { updatedAt: 'desc' },
        include: {
            enquiry: {
                include: {
                    client: true,
                    service: true
                }
            }
        }
    });

    const completedAllocationIds = completedAllocations.map(a => a.id);
    const existingCompletedInvoices = completedAllocationIds.length ? await prisma.accountTransaction.findMany({
        where: { allocationId: { in: completedAllocationIds }, type: 'INVOICE', tenantId, isDeleted: false },
        select: { allocationId: true }
    }) : [];
    const existingCompletedAllocationIds = new Set(existingCompletedInvoices.map(i => i.allocationId).filter(Boolean));

    for (const allocation of completedAllocations) {
        if (existingCompletedAllocationIds.has(allocation.id)) continue;
        try {
            await createInvoiceDraftForCompletedAllocation(prisma, allocation);
        } catch (error) {
            console.warn('Completed service invoice reconciliation skipped:', error?.message || error);
        }
    }
};

export const getFinancialClearance = async (tenantId, enquiryId, unitId) => {
    if (!enquiryId) {
        return { totalInvoice: 0, totalReceipt: 0, outstandingBalance: 0, isCleared: true };
    }

    const allocationWhere = { enquiryId, tenantId, isDeleted: false };
    if (unitId && unitId !== 'ALL') {
        allocationWhere.unitId = unitId;
    }

    const allocations = await prisma.allocation.findMany({
        where: allocationWhere,
        select: { id: true }
    });
    const allocationIds = allocations.map(a => a.id);

    if (!allocationIds.length) {
        return { totalInvoice: 0, totalReceipt: 0, outstandingBalance: 0, isCleared: true };
    }

    const txWhere = { allocationId: { in: allocationIds }, status: 'POSTED', isDeleted: false };
    if (unitId && unitId !== 'ALL') {
        txWhere.unitId = unitId;
    }

    const transactions = await prisma.accountTransaction.findMany({
        where: txWhere,
        select: { type: true, amount: true }
    });

    const totalInvoice = transactions
        .filter(t => t.type === 'INVOICE')
        .reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const totalReceipt = transactions
        .filter(t => t.type === 'RECEIPT')
        .reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const rawBalance = totalInvoice - totalReceipt;
    const outstandingBalance = Number(Math.max(0, rawBalance).toFixed(2));

    return {
        totalInvoice: Number(totalInvoice.toFixed(2)),
        totalReceipt: Number(totalReceipt.toFixed(2)),
        outstandingBalance,
        isCleared: outstandingBalance <= 0
    };
};

export const postMonthlyPatientInvoiceToLedger = async (tx, { tenantId, unitId, allocationId, totalAmount, clientName, notes, metadata }) => {
    const counter = await tx.refCounter.upsert({
        where: {
            prefix_tenantId: {
                prefix: 'INV',
                tenantId
            }
        },
        update: { current: { increment: 1 } },
        create: {
            prefix: 'INV',
            current: 1,
            tenantId,
            unitId
        }
    });
    const refNo = `INV-${String(counter.current).padStart(6, '0')}`;

    return tx.accountTransaction.create({
        data: {
            refNo,
            allocationId,
            type: 'INVOICE',
            amount: totalAmount,
            paymentMode: 'UPI',
            category: 'Monthly Patient Invoice',
            clientName: clientName || 'Patient Family',
            notes: notes || 'Monthly patient invoice',
            status: 'CREATED',
            date: new Date(),
            metadata,
            tenantId,
            unitId
        }
    });
};

export const createInvoice = async (tenantId, unitId, data) => {
    await ensurePatientBillingTables();
    const refNo = await generateRef('INV', tenantId, unitId);
    
    let contractStartDate = null;
    let contractEndDate = null;
    
    if (data.allocationId) {
        const allocation = await prisma.allocation.findFirst({
            where: { id: data.allocationId, tenantId },
            include: { enquiry: { include: { admission: { include: { serviceContract: true } } } } }
        });
        
        const contract = allocation?.enquiry?.admission?.serviceContract;
        
        if (!contract || contract.status !== 'ACTIVE') {
            throw new Error('Invoice generation rejected: Active Service Contract required');
        }
        
        contractStartDate = contract.startDate;
        contractEndDate = contract.endDate;
    }

    return prisma.$transaction(async (tx) => {
        const invoice = await tx.invoice.create({
            data: {
                amount: Number(data.amount),
                status: data.status || 'ISSUED',
                tenantId,
                unitId,
                contractStartDate,
                contractEndDate
            }
        });

        const accountInvoice = await tx.accountTransaction.create({
            data: {
                refNo,
                allocationId: data.allocationId || null,
                type: 'INVOICE',
                amount: Number(data.amount),
                paymentMode: data.mode,
                category: data.category,
                clientName: data.clientName || data.vendor || data.source,
                notes: data.notes || data.remarks,
                status: 'POSTED',
                date: data.date ? new Date(data.date) : new Date(),
                metadata: {
                    source: 'MANUAL_ACCOUNT_INVOICE',
                    allocationId: data.allocationId || null
                },
                tenantId,
                unitId
            }
        });
        await postAccountInvoiceToPatientLedger(tx, accountInvoice);

        return invoice;
    });
};

export const listInvoices = async (tenantId, unitId, options = {}) => {
    const params = [tenantId];
    const filters = [
        '"tenantId" = $1',
        'COALESCE("isDeleted", false) = false',
        `"type"::text = 'INVOICE'`
    ];

    if (unitId && unitId !== 'ALL') {
        params.push(unitId);
        filters.push(`"unitId" = $${params.length}`);
    }

    const search = String(options.search || '').trim();
    if (search) {
        params.push(`%${search}%`);
        const searchParam = `$${params.length}`;
        filters.push(`(
            "refNo" ILIKE ${searchParam}
            OR "clientName" ILIKE ${searchParam}
            OR "category" ILIKE ${searchParam}
            OR "notes" ILIKE ${searchParam}
            OR "allocationId"::text ILIKE ${searchParam}
            OR "metadata"->>'allocationRef' ILIKE ${searchParam}
            OR "metadata"->>'taskRefNo' ILIKE ${searchParam}
            OR "metadata"->>'patientName' ILIKE ${searchParam}
        )`);
    }

    const requestedLimit = Number(options.limit);
    const limit = Number.isFinite(requestedLimit)
        ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 500)
        : 200;
    params.push(limit);

    const rows = await prisma.$queryRawUnsafe(`
        SELECT * FROM (
            SELECT
                "id",
                "refNo",
                "allocationId",
                "type"::text AS "type",
                "amount",
                "paymentMode",
                "category",
                "clientName",
                "status"::text AS "status",
                "notes",
                "metadata",
                "date",
                "tenantId",
                "unitId",
                "isDeleted",
                "deletedAt",
                "createdAt",
                "updatedAt"
            FROM "AccountTransaction"
            UNION ALL
            SELECT
                "id",
                "refNo",
                NULL::text AS "allocationId",
                'INVOICE' AS "type",
                "amount",
                NULL::text AS "paymentMode",
                'Manual Billing' AS "category",
                COALESCE("metadata"->>'patientName', 'Manual Bill') AS "clientName",
                CASE WHEN "status" = 'FINALIZED' THEN 'POSTED' ELSE "status"::text END AS "status",
                'Manual Bill Generation' AS "notes",
                "metadata",
                "createdAt" AS "date",
                "tenantId",
                "unitId",
                false AS "isDeleted",
                NULL::timestamp AS "deletedAt",
                "createdAt",
                "updatedAt"
            FROM "Invoice"
            WHERE "isFinalized" = true
        ) AS "CombinedInvoices"
        WHERE ${filters.join('\n          AND ')}
        ORDER BY "createdAt" DESC
        LIMIT ${params.length}
    `, ...params);

    const allocIds = rows.filter(r => r.allocationId).map(r => `'${r.allocationId}'`);
    if (allocIds.length > 0) {
        try {
            const allocs = await prisma.$queryRawUnsafe(`
                SELECT a."id", 
                       p."name" as "patientName", p."phone" as "patientPhone", p."emergencyContact",
                       c."name" as "clientName", c."mobile" as "clientMobile"
                FROM "Allocation" a
                LEFT JOIN "Admission" adm ON a."admissionId" = adm."id"
                LEFT JOIN "Patient" p ON adm."patientId" = p."id"
                LEFT JOIN "Enquiry" e ON a."enquiryId" = e."id"
                LEFT JOIN "Client" c ON e."clientId" = c."id"
                WHERE a."id"::text IN (${allocIds.join(',')})
            `);
            const allocMap = new Map(allocs.map(a => [a.id, a]));
            return rows.map(r => {
                const meta = r.metadata || {};
                const alloc = allocMap.get(r.allocationId);
                if (alloc) {
                    const resolvedName = alloc.patientName || alloc.clientName || r.clientName;
                    const resolvedContact = meta.familyContact || alloc.patientPhone || alloc.clientMobile || alloc.emergencyContact;
                    return {
                        ...r,
                        clientName: (r.clientName === 'Client' && resolvedName) ? resolvedName : r.clientName,
                        metadata: {
                            ...meta,
                            patientName: meta.patientName || resolvedName,
                            familyContact: resolvedContact || null
                        }
                    };
                }
                return r;
            });
        } catch {
            return rows;
        }
    }

    return rows;
};

export const createIncome = async (tenantId, unitId, userId, data) => {
    const refNo = await generateRef('REC', tenantId, unitId);

    // AI Anomaly Check
    const anomalyResult = await AnomalyEngine.detectTransactionAnomaly(tenantId, unitId, { ...data, type: 'RECEIPT' });

    return prisma.accountTransaction.create({
        data: {
            refNo,
            type: 'RECEIPT',
            amount: Number(data.amount),
            paymentMode: data.mode,
            category: data.category,
            clientName: data.clientName || data.vendor || data.source,
            notes: data.notes || data.remarks,
            status: 'PENDING_APPROVAL',
            metadata: buildMetadata(data, anomalyResult),
            date: data.date ? new Date(data.date) : new Date(),
            tenantId,
            unitId
        }
    });
};

export const recordInvoicePayment = async (tenantId, unitId, userId, invoiceId, data) => {
    return prisma.$transaction(async (tx) => {
        let isInvoiceTableModel = false;
        let invoice = await tx.accountTransaction.findFirst({
            where: {
                id: invoiceId,
                tenantId,
                type: 'INVOICE',
                isDeleted: false
            }
        });

        if (!invoice) {
            invoice = await tx.invoice.findFirst({
                where: {
                    id: invoiceId,
                    tenantId,
                    isFinalized: true
                }
            });
            if (invoice) {
                isInvoiceTableModel = true;
            } else {
                const error = new Error('Invoice not found');
                error.status = 404;
                throw error;
            }
        }

        const invoiceStatus = isInvoiceTableModel ? (invoice.status === 'FINALIZED' ? 'POSTED' : invoice.status) : invoice.status;

        if (invoiceStatus === 'REJECTED') {
            const error = new Error('Cancelled or rejected invoices cannot receive payments');
            error.status = 400;
            throw error;
        }

        if (!['POSTED', 'CREATED', 'APPROVED'].includes(invoiceStatus)) {
            const error = new Error('Only active invoices can receive payments');
            error.status = 400;
            throw error;
        }

        const invoiceMetadata = invoice.metadata && typeof invoice.metadata === 'object' ? invoice.metadata : {};
        const requestedAmount = Number(data.amount);
        const invoiceAmount = Math.max(0, Number(invoice.amount || 0));

        const receipts = await tx.accountTransaction.findMany({
            where: {
                tenantId,
                type: 'RECEIPT',
                isDeleted: false
            },
            select: {
                id: true,
                amount: true,
                metadata: true
            }
        });

        const paidBefore = receipts
            .filter((receipt) => receipt.metadata?.invoiceId === invoice.id)
            .reduce((total, receipt) => total + Math.max(0, Number(receipt.amount || 0)), 0);

        const balanceBefore = Math.max(0, invoiceAmount - paidBefore);

        if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
            const error = new Error('Enter a valid payment amount');
            error.status = 400;
            throw error;
        }

        if (requestedAmount > balanceBefore + 0.01) {
            const error = new Error(`Payment exceeds pending balance of Rs ${balanceBefore.toFixed(2)}`);
            error.status = 400;
            throw error;
        }

        const paidAfter = Number((paidBefore + requestedAmount).toFixed(2));
        const balanceAfter = Number(Math.max(0, invoiceAmount - paidAfter).toFixed(2));
        const paymentStatus = balanceAfter <= 0.01 ? 'PAID' : 'PARTIAL';

        const receipt = await tx.accountTransaction.create({
            data: {
                refNo: await generateRef('REC', tenantId, invoice.unitId || unitId, tx),
                allocationId: isInvoiceTableModel ? null : invoice.allocationId,
                type: 'RECEIPT',
                amount: requestedAmount,
                paymentMode: data.mode || (isInvoiceTableModel ? 'Cash' : invoice.paymentMode || 'Cash'),
                category: isInvoiceTableModel ? 'Manual Billing' : (invoice.category || 'Service Payment'),
                clientName: isInvoiceTableModel ? (invoiceMetadata.patientName || 'Manual Bill') : invoice.clientName,
                notes: data.remarks || `Payment received for invoice ${invoice.refNo}`,
                status: 'POSTED',
                date: data.date ? new Date(data.date) : new Date(),
                metadata: {
                    source: 'INVOICE_PAYMENT',
                    invoiceId: invoice.id,
                    invoiceRefNo: invoice.refNo,
                    allocationId: isInvoiceTableModel ? null : invoice.allocationId,
                    taskId: invoiceMetadata.taskId || null,
                    taskRefNo: invoiceMetadata.taskRefNo || null,
                    previousPaidAmount: Number(paidBefore.toFixed(2)),
                    paidAmount: requestedAmount,
                    balanceAmount: balanceAfter,
                    paymentStatus
                },
                tenantId,
                unitId: invoice.unitId || unitId
            }
        });

        let updatedInvoice;
        if (isInvoiceTableModel) {
            updatedInvoice = await tx.invoice.update({
                where: { id: invoice.id },
                data: {
                    metadata: {
                        ...invoiceMetadata,
                        paidAmount: paidAfter,
                        balanceAmount: balanceAfter,
                        paymentStatus,
                        lastReceiptId: receipt.id,
                        lastReceiptRefNo: receipt.refNo,
                        lastPaymentAt: receipt.date
                    }
                }
            });
        } else {
            updatedInvoice = await tx.accountTransaction.update({
                where: { id: invoice.id },
                data: {
                    status: 'POSTED',
                    paymentMode: data.mode || invoice.paymentMode,
                    metadata: {
                        ...invoiceMetadata,
                        paidAmount: paidAfter,
                        balanceAmount: balanceAfter,
                        paymentStatus,
                        lastReceiptId: receipt.id,
                        lastReceiptRefNo: receipt.refNo,
                        lastPaymentAt: receipt.date
                    }
                }
            });
        }

        let closedAllocation = null;
        if (paymentStatus === 'PAID' && invoice.allocationId) {
            const allocation = await tx.allocation.findFirst({
                where: {
                    id: invoice.allocationId,
                    tenantId,
                    isDeleted: false
                },
                select: {
                    id: true,
                    enquiryId: true,
                    metadata: true,
                    status: true
                }
            });

            if (allocation) {
                const allocationMetadata = allocation.metadata && typeof allocation.metadata === 'object' ? allocation.metadata : {};
                closedAllocation = await tx.allocation.update({
                    where: { id: allocation.id },
                    data: {
                        status: 'COMPLETED',
                        metadata: {
                            ...allocationMetadata,
                            workflowClosedAt: receipt.date,
                            paymentStatus,
                            paidAmount: paidAfter,
                            balanceAmount: balanceAfter,
                            receiptId: receipt.id,
                            receiptRefNo: receipt.refNo,
                            invoiceId: invoice.id,
                            invoiceRefNo: invoice.refNo
                        }
                    }
                });

                if (allocation.enquiryId) {
                    await tx.enquiry.updateMany({
                        where: {
                            id: allocation.enquiryId,
                            tenantId,
                            isDeleted: false
                        },
                        data: {
                            status: 'CLOSED'
                        }
                    });
                }

                if (String(invoiceMetadata.source || '') !== 'PATIENT_EXPENSE_LEDGER') {
                    const syncResult = await reconcileAllocationCompletionBilling(tx, {
                        tenantId,
                        allocationId: allocation.id,
                        completedAt: receipt.date,
                        createdBy: userId
                    });
                    const closedMetadata = closedAllocation.metadata && typeof closedAllocation.metadata === 'object'
                        ? closedAllocation.metadata
                        : {};
                    closedAllocation = await tx.allocation.update({
                        where: { id: allocation.id },
                        data: {
                            metadata: {
                                ...closedMetadata,
                                enquiryCompletionBillingSyncedAt: new Date(),
                                enquiryCompletionBillingSync: syncResult
                            }
                        }
                    });
                }
            }
        }

        await tx.workflowLog.create({
            data: {
                entityType: 'ACCOUNT_TRANSACTION',
                entityId: invoice.id,
                fromState: invoiceMetadata.paymentStatus || 'UNPAID',
                toState: paymentStatus,
                actionBy: userId,
                notes: `Receipt ${receipt.refNo} collected for ${invoice.refNo}`,
                tenantId,
                unitId: invoice.unitId || unitId
            }
        });

        if (paymentStatus === 'PAID') {
            await tx.workflowLog.create({
                data: {
                    entityType: 'ALLOCATION',
                    entityId: invoice.allocationId || invoice.id,
                    fromState: 'PAYMENT_COLLECTED',
                    toState: 'WORKFLOW_CLOSED',
                    actionBy: userId,
                    notes: `Workflow closed after full payment receipt ${receipt.refNo}`,
                    tenantId,
                    unitId: invoice.unitId || unitId
                }
            });
        }

        return {
            invoice: updatedInvoice,
            receipt,
            allocation: closedAllocation,
            paymentSummary: {
                invoiceAmount,
                paidBefore: Number(paidBefore.toFixed(2)),
                paidAmount: requestedAmount,
                paidAfter,
                balanceAmount: balanceAfter,
                paymentStatus
            }
        };
    });
};

export const createExpense = async (tenantId, unitId, userId, data) => {
    const refNo = await generateRef('EXP', tenantId, unitId);

    // AI Anomaly Check
    const anomalyResult = await AnomalyEngine.detectTransactionAnomaly(tenantId, unitId, { ...data, type: 'EXPENSE' });

    return prisma.accountTransaction.create({
        data: {
            refNo,
            type: 'EXPENSE',
            amount: Number(-Math.abs(data.amount)), // Expense amount negative to reflect in totals
            paymentMode: data.mode,
            category: data.category,
            clientName: data.clientName || data.vendor || data.source,
            notes: data.notes || data.remarks,
            status: 'PENDING_APPROVAL',
            metadata: buildMetadata(data, anomalyResult),
            date: data.date ? new Date(data.date) : new Date(),
            tenantId,
            unitId
        }
    });
};

export const getCashbox = async (tenantId, unitId, fromDate, toDate) => {
    const where = {
        tenantId,
        isDeleted: false,
        type: { in: ['RECEIPT', 'EXPENSE', 'REFUND'] }
    };
    if (unitId && unitId !== 'ALL') {
        where.unitId = unitId;
    }

    if (fromDate && toDate) {
        const start = new Date(fromDate);
        const end = new Date(toDate);

        if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && start <= end) {
            end.setDate(end.getDate() + 1);
            where.date = {
                gte: start,
                lt: end
            };
        } else {
            const error = new Error('Invalid date range');
            error.status = 400;
            throw error;
        }
    }

    return prisma.accountTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' }
    });
};

export const approveTransaction = async (id, approverId, status, comments) => {
    return prisma.$transaction(async (tx) => {
        const existingTransaction = await tx.accountTransaction.findUnique({
            where: { id }
        });

        if (!existingTransaction || existingTransaction.isDeleted) {
            const error = new Error('Transaction not found');
            error.status = 404;
            throw error;
        }

        if (existingTransaction.type === 'INVOICE' && status === 'APPROVED' && Number(existingTransaction.amount || 0) <= 0) {
            const error = new Error('Enter a valid invoice amount before posting');
            error.status = 400;
            throw error;
        }

        const transaction = await tx.accountTransaction.update({
            where: { id },
            data: {
                status: status === 'APPROVED' ? 'POSTED' : 'REJECTED'
            }
        });

        await tx.approval.create({
            data: {
                entityType: 'ACCOUNT_TRANSACTION',
                entityId: id,
                approverId,
                status,
                comments,
                tenantId: transaction.tenantId,
                unitId: transaction.unitId
            }
        });

        return transaction;
    });
};

export const updateTransaction = async (id, tenantId, unitId, data) => {
    // Two-step validation
    const where = { id, tenantId, isDeleted: false };
    if (unitId && unitId !== 'ALL') {
        where.unitId = unitId;
    }
    const existing = await prisma.accountTransaction.findFirst({ where });

    if (!existing) {
        throw new Error('Transaction not found or unauthorized');
    }

    return prisma.accountTransaction.update({
        where: { id },
        data: {
            category: data.category,
            amount: data.amount !== undefined ? Number(data.type === 'EXPENSE' ? -Math.abs(data.amount) : Math.abs(data.amount)) : undefined,
            paymentMode: data.mode,
            clientName: data.clientName || data.vendor || data.source,
            notes: data.notes || data.remarks,
            date: data.date ? new Date(data.date) : undefined
        }
    });
};

export const deleteTransaction = async (id, tenantId, unitId) => {
    // Two-step validation
    const where = { id, tenantId, isDeleted: false };
    if (unitId && unitId !== 'ALL') {
        where.unitId = unitId;
    }
    const existing = await prisma.accountTransaction.findFirst({ where });

    if (!existing) {
        throw new Error('Transaction not found or unauthorized');
    }

    return prisma.accountTransaction.update({
        where: { id },
        data: { isDeleted: true }
    });
};
