import { prisma } from '../../app/prisma.js';
import { generateRefNumber } from '../../shared/utils/refGenerator.js';
import { randomUUID } from 'crypto';

export interface RecurringBillingItem {
    allocationId: string;
    admissionId?: string | null;
    patientId?: string | null;
    patientName: string;
    clientName: string;
    unitId: string;
    monthlyBoardingFee: number;
    careTariffFee: number;
    totalMonthlyFee: number;
    status: 'READY_TO_BILL' | 'ALREADY_BILLED';
    existingInvoiceRef?: string | null;
    existingInvoiceId?: string | null;
}

export class RecurringBillingService {
    /**
     * Preview upcoming monthly recurring billing cycle for all active residents/clients
     */
    async previewCycle(
        scope: { tenantId: string; unitId?: string | null },
        month: number,
        year: number,
        tx?: any
    ): Promise<{
        cycleLabel: string;
        month: number;
        year: number;
        totalEligible: number;
        readyToBillCount: number;
        alreadyBilledCount: number;
        estimatedTotalBilling: number;
        items: RecurringBillingItem[];
    }> {
        const db = tx || prisma;
        const monthPad = String(month).padStart(2, '0');
        const cycleKey = `${year}-${monthPad}`;
        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        const cycleLabel = `${monthNames[month - 1] || 'Month'} ${year}`;

        // 1. Fetch active allocations (AllocationStatus: ALLOCATED or PENDING)
        const allocWhere: any = {
            tenantId: scope.tenantId,
            status: { in: ['ALLOCATED', 'PENDING'] },
            isDeleted: false
        };
        if (scope.unitId && scope.unitId !== 'ALL_UNITS') {
            allocWhere.unitId = scope.unitId;
        }

        const activeAllocations = await db.allocation.findMany({
            where: allocWhere,
            include: {
                enquiry: {
                    include: {
                        client: true,
                        admission: {
                            include: {
                                patient: true
                            }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        // 2. Fetch existing recurring invoices generated for this cycle
        const existingInvoices = await db.accountTransaction.findMany({
            where: {
                tenantId: scope.tenantId,
                type: 'INVOICE',
                category: 'RECURRING_MONTHLY_BOARDING',
                isDeleted: false
            }
        });

        const invoiceMapByAllocation = new Map<string, any>();
        for (const inv of existingInvoices) {
            const metadata: any = inv.metadata || {};
            if (metadata.monthlyCycle === cycleKey && metadata.allocationId) {
                invoiceMapByAllocation.set(metadata.allocationId, inv);
            }
        }

        const items: RecurringBillingItem[] = [];
        let readyCount = 0;
        let billedCount = 0;
        let estimatedTotal = 0;

        for (const alloc of activeAllocations) {
            const admission = alloc.enquiry?.admission;
            const patient = admission?.patient;
            const client = alloc.enquiry?.client;
            const metadata: any = alloc.metadata || {};

            const patientName = patient?.name || metadata.patientName || client?.name || 'Resident';
            const clientName = client?.name || metadata.patientName || 'Family Contact';

            const monthlyBoardingFee = Number(metadata.monthlyRate || metadata.boardingFee || 15000);
            const careTariffFee = Number(metadata.careTariff || 2500);
            const totalMonthlyFee = monthlyBoardingFee + careTariffFee;

            const existingInv = invoiceMapByAllocation.get(alloc.id);
            const isBilled = !!existingInv;

            if (isBilled) {
                billedCount++;
            } else {
                readyCount++;
                estimatedTotal += totalMonthlyFee;
            }

            items.push({
                allocationId: alloc.id,
                admissionId: admission?.id || null,
                patientId: patient?.id || null,
                patientName,
                clientName,
                unitId: alloc.unitId,
                monthlyBoardingFee,
                careTariffFee,
                totalMonthlyFee,
                status: isBilled ? 'ALREADY_BILLED' : 'READY_TO_BILL',
                existingInvoiceRef: existingInv ? existingInv.refNo : null,
                existingInvoiceId: existingInv ? existingInv.id : null
            });
        }

        return {
            cycleLabel,
            month,
            year,
            totalEligible: activeAllocations.length,
            readyToBillCount: readyCount,
            alreadyBilledCount: billedCount,
            estimatedTotalBilling: estimatedTotal,
            items
        };
    }

    /**
     * Generate recurring monthly invoices in an idempotent batch transaction
     */
    async executeCycle(
        scope: { tenantId: string; unitId: string },
        user: { id: string; email?: string },
        payload: {
            month: number;
            year: number;
            selectedAllocationIds?: string[];
        },
        tx?: any
    ): Promise<{
        success: boolean;
        cycleLabel: string;
        invoicesGenerated: number;
        totalAmountBilled: number;
        generatedInvoices: Array<{ id: string; refNo: string; patientName: string; amount: number }>;
    }> {
        const db = tx || prisma;
        const monthPad = String(payload.month).padStart(2, '0');
        const cycleKey = `${payload.year}-${monthPad}`;

        const preview = await this.previewCycle(scope, payload.month, payload.year, db);
        const toBill = preview.items.filter(item => {
            if (item.status === 'ALREADY_BILLED') return false;
            if (payload.selectedAllocationIds && payload.selectedAllocationIds.length > 0) {
                return payload.selectedAllocationIds.includes(item.allocationId);
            }
            return true;
        });

        if (toBill.length === 0) {
            return {
                success: true,
                cycleLabel: preview.cycleLabel,
                invoicesGenerated: 0,
                totalAmountBilled: 0,
                generatedInvoices: []
            };
        }

        const generated: Array<{ id: string; refNo: string; patientName: string; amount: number }> = [];
        let totalBilled = 0;

        for (const item of toBill) {
            const invRef = await generateRefNumber('INV', scope.tenantId, item.unitId, db);
            const invoiceDate = new Date(payload.year, payload.month - 1, 1);

            const invoice = await db.accountTransaction.create({
                data: {
                    id: randomUUID(),
                    refNo: invRef,
                    type: 'INVOICE',
                    category: 'RECURRING_MONTHLY_BOARDING',
                    amount: item.totalMonthlyFee,
                    clientName: item.patientName,
                    status: 'APPROVED',
                    date: invoiceDate,
                    notes: `Recurring Monthly Boarding & Care - ${preview.cycleLabel} for ${item.patientName}`,
                    tenantId: scope.tenantId,
                    unitId: item.unitId,
                    metadata: {
                        monthlyCycle: cycleKey,
                        cycleLabel: preview.cycleLabel,
                        allocationId: item.allocationId,
                        patientId: item.patientId,
                        admissionId: item.admissionId,
                        lineItems: [
                            { description: `Monthly Boarding & Stay Fee (${preview.cycleLabel})`, amount: item.monthlyBoardingFee },
                            { description: `Nursing Care & Vital Monitoring Tariff`, amount: item.careTariffFee }
                        ],
                        generatedAt: new Date().toISOString(),
                        generatedBy: user.id
                    }
                }
            });

            generated.push({
                id: invoice.id,
                refNo: invoice.refNo,
                patientName: item.patientName,
                amount: item.totalMonthlyFee
            });
            totalBilled += item.totalMonthlyFee;
        }

        return {
            success: true,
            cycleLabel: preview.cycleLabel,
            invoicesGenerated: generated.length,
            totalAmountBilled: totalBilled,
            generatedInvoices: generated
        };
    }
}

export const recurringBillingService = new RecurringBillingService();
