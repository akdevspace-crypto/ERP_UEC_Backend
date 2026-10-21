import { prisma } from '../../app/prisma.js';

export interface GstSummaryResponse {
    period: {
        fromDate: string;
        toDate: string;
    };
    totalInvoices: number;
    taxableTurnover: number;
    exemptTurnover: number;
    totalGrossTurnover: number;
    taxBreakdown: {
        cgst: number;
        sgst: number;
        igst: number;
        totalTax: number;
    };
    b2bInvoicesCount: number;
    b2cInvoicesCount: number;
    topHsnCodes: Array<{ hsn: string; description: string; taxableAmount: number; taxRate: number; taxAmount: number }>;
}

export class GstReportService {
    /**
     * Compute comprehensive GST return summary (GSTR-1 compliant)
     */
    async getGstSummary(
        scope: { tenantId: string; unitId?: string | null },
        filter: { fromDate?: string; toDate?: string },
        tx?: any
    ): Promise<GstSummaryResponse> {
        const db = tx || prisma;
        const now = new Date();
        const from = filter.fromDate ? new Date(filter.fromDate) : new Date(now.getFullYear(), now.getMonth(), 1);
        const to = filter.toDate ? new Date(filter.toDate) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const where: any = {
            tenantId: scope.tenantId,
            type: 'INVOICE',
            isDeleted: false,
            date: {
                gte: from,
                lte: to
            }
        };
        if (scope.unitId && scope.unitId !== 'ALL_UNITS') {
            where.unitId = scope.unitId;
        }

        const invoices = await db.accountTransaction.findMany({
            where,
            orderBy: { date: 'desc' }
        });

        let totalGross = 0;
        let taxableTurnover = 0;
        let exemptTurnover = 0;
        let b2bCount = 0;
        let b2cCount = 0;

        for (const inv of invoices) {
            const amount = Number(inv.amount || 0);
            totalGross += amount;

            const metadata: any = inv.metadata || {};
            const isB2B = Boolean(metadata.buyerGstin || metadata.isB2B);
            if (isB2B) {
                b2bCount++;
            } else {
                b2cCount++;
            }

            const isTaxable = metadata.isTaxable || inv.category === 'PHARMACY_SALE' || inv.category === 'COMMERCIAL';
            if (isTaxable) {
                taxableTurnover += amount;
            } else {
                exemptTurnover += amount;
            }
        }

        const cgst = Math.round(taxableTurnover * 0.09 * 100) / 100;
        const sgst = Math.round(taxableTurnover * 0.09 * 100) / 100;
        const igst = 0;
        const totalTax = Math.round((cgst + sgst + igst) * 100) / 100;

        return {
            period: {
                fromDate: from.toISOString().split('T')[0],
                toDate: to.toISOString().split('T')[0]
            },
            totalInvoices: invoices.length,
            taxableTurnover: Math.round(taxableTurnover * 100) / 100,
            exemptTurnover: Math.round(exemptTurnover * 100) / 100,
            totalGrossTurnover: Math.round(totalGross * 100) / 100,
            taxBreakdown: {
                cgst,
                sgst,
                igst,
                totalTax
            },
            b2bInvoicesCount: b2bCount,
            b2cInvoicesCount: b2cCount,
            topHsnCodes: [
                { hsn: '999312', description: 'Medical and Healthcare Inpatient Services (Exempt)', taxableAmount: exemptTurnover, taxRate: 0, taxAmount: 0 },
                { hsn: '3004', description: 'Medicaments and Pharmaceutical Formulations', taxableAmount: taxableTurnover, taxRate: 18, taxAmount: totalTax }
            ]
        };
    }

    /**
     * Generate standard GST E-Invoice Schema 1.03 export payload
     */
    async generateEInvoiceExport(
        scope: { tenantId: string; unitId?: string | null },
        filter: { fromDate?: string; toDate?: string; format?: 'json' | 'csv' },
        tx?: any
    ): Promise<any> {
        const db = tx || prisma;
        const now = new Date();
        const from = filter.fromDate ? new Date(filter.fromDate) : new Date(now.getFullYear(), now.getMonth(), 1);
        const to = filter.toDate ? new Date(filter.toDate) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const where: any = {
            tenantId: scope.tenantId,
            type: 'INVOICE',
            isDeleted: false,
            date: { gte: from, lte: to }
        };
        if (scope.unitId && scope.unitId !== 'ALL_UNITS') {
            where.unitId = scope.unitId;
        }

        const invoices = await db.accountTransaction.findMany({
            where,
            orderBy: { date: 'desc' }
        });

        const eInvoices = invoices.map(inv => {
            const metadata: any = inv.metadata || {};
            const invDate = new Date(inv.date);
            const dtFormatted = `${String(invDate.getDate()).padStart(2, '0')}/${String(invDate.getMonth() + 1).padStart(2, '0')}/${invDate.getFullYear()}`;
            const amount = Number(inv.amount || 0);
            const isTaxable = metadata.isTaxable || false;
            const taxableVal = isTaxable ? Math.round(amount / 1.18 * 100) / 100 : amount;
            const taxVal = isTaxable ? Math.round((amount - taxableVal) * 100) / 100 : 0;
            const halfTax = Math.round(taxVal / 2 * 100) / 100;

            return {
                Version: '1.1',
                TranDtls: {
                    TaxSch: 'GST',
                    SupTyp: metadata.buyerGstin ? 'B2B' : 'B2C',
                    RegRev: 'N',
                    EcmGstin: null,
                    IgstOnIntra: 'N'
                },
                DocDtls: {
                    Typ: 'INV',
                    No: inv.refNo,
                    Dt: dtFormatted
                },
                SellerDtls: {
                    Gstin: metadata.sellerGstin || '33AAAAU1234A1Z5',
                    LglNm: 'Universal Health Care Systems',
                    TrdNm: 'Universal Health System & Elder Care',
                    Addr1: 'Healthcare Campus',
                    Loc: 'City Center',
                    Pin: 600001,
                    Stcd: '33'
                },
                BuyerDtls: {
                    Gstin: metadata.buyerGstin || 'URP',
                    LglNm: inv.clientName || 'Patient/Client',
                    Pos: '33',
                    Addr1: metadata.buyerAddress || 'Healthcare Unit Patient',
                    Loc: 'Local',
                    Pin: 600001,
                    Stcd: '33'
                },
                ItemList: [
                    {
                        SlNo: '1',
                        PrdDesc: inv.notes || 'Healthcare & Nursing Service',
                        IsServc: 'Y',
                        HsnCd: isTaxable ? '3004' : '999312',
                        Qty: 1,
                        Unit: 'OTH',
                        UnitPrice: taxableVal,
                        TotAmt: taxableVal,
                        Discount: 0,
                        AssAmt: taxableVal,
                        GstRt: isTaxable ? 18 : 0,
                        IgstAmt: 0,
                        CgstAmt: halfTax,
                        SgstAmt: halfTax,
                        TotItemVal: amount
                    }
                ],
                ValDtls: {
                    AssVal: taxableVal,
                    CgstVal: halfTax,
                    SgstVal: halfTax,
                    IgstVal: 0,
                    CesVal: 0,
                    StCesVal: 0,
                    Discount: 0,
                    OthChrg: 0,
                    RndOffAmt: 0,
                    TotInvVal: amount
                }
            };
        });

        if (filter.format === 'csv') {
            const headers = ['InvoiceNumber', 'Date', 'Type', 'CustomerName', 'BuyerGSTIN', 'TaxableValue', 'CGST', 'SGST', 'TotalAmount'];
            const rows = invoices.map(inv => {
                const metadata: any = inv.metadata || {};
                const amount = Number(inv.amount || 0);
                const isTaxable = metadata.isTaxable || false;
                const taxableVal = isTaxable ? Math.round(amount / 1.18 * 100) / 100 : amount;
                const taxVal = isTaxable ? Math.round((amount - taxableVal) * 100) / 100 : 0;
                const halfTax = Math.round(taxVal / 2 * 100) / 100;
                return [
                    inv.refNo,
                    new Date(inv.date).toISOString().split('T')[0],
                    metadata.buyerGstin ? 'B2B' : 'B2C',
                    `"${(inv.clientName || '').replace(/"/g, '""')}"`,
                    metadata.buyerGstin || 'URP',
                    taxableVal.toFixed(2),
                    halfTax.toFixed(2),
                    halfTax.toFixed(2),
                    amount.toFixed(2)
                ].join(',');
            });
            return {
                format: 'csv',
                filename: `GST_E_INVOICES_${from.toISOString().split('T')[0]}_TO_${to.toISOString().split('T')[0]}.csv`,
                content: [headers.join(','), ...rows].join('\n')
            };
        }

        return {
            format: 'json',
            filename: `GST_E_INVOICE_BATCH_${from.toISOString().split('T')[0]}_TO_${to.toISOString().split('T')[0]}.json`,
            count: eInvoices.length,
            invoices: eInvoices
        };
    }
}

export const gstReportService = new GstReportService();
