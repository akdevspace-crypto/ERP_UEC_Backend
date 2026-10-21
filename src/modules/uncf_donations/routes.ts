import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../app/prisma.js';
import { protect as auth } from '../../shared/middleware/auth.middleware.js';
import { enforceTenant } from '../../shared/middleware/tenant.middleware.js';
import { requireAnyPermission } from '../../shared/middleware/rbac.middleware.js';

const router = Router();

const donationRoles = [
    'SUPER_ADMIN', 'SUPERADMIN', 'ADMIN', 'UNCF_ADMIN',
    'DONOR_COORDINATOR', 'FINANCE_MANAGER'
];
const donationPermissions = [
    'Donations', 'Donors', 'UNCF Donations', 'Donors & Volunteers',
    'Donation Entry', 'Donor Directory', 'ALL_ACCESS'
];

router.use(auth);
router.use(enforceTenant);
router.use(requireAnyPermission(donationPermissions, donationRoles));

export const createDonationSchema = z.object({
    donorId: z.string().trim().optional(),
    name: z.string().trim().optional(),
    isAnonymous: z.boolean().optional(),
    fatherOrHusbandName: z.string().trim().optional().nullable(),
    residentialAddress: z.string().trim().optional().nullable(),
    permanentAddress: z.string().trim().optional().nullable(),
    mobile: z.string().trim().optional().nullable(),
    whatsappNumber: z.string().trim().optional().nullable(),
    email: z.string().trim().email('Invalid email address format').optional().or(z.literal('')).nullable(),
    panNumber: z.string().trim().optional().nullable(),
    dob: z.string().or(z.date()).optional().nullable(),
    isCorporate: z.boolean().optional(),

    amount: z.preprocess(
        v => (v === undefined || v === null || v === '') ? undefined : (isNaN(Number(v)) ? v : Number(v)),
        z.number({ message: 'Donation amount is required and must be a valid number' })
    ),
    amountInWords: z.string().trim().optional().nullable(),
    paymentMode: z.string({ message: 'Payment mode is required' }).trim().min(1, 'Payment mode is required'),
    materialDetails: z.string().trim().optional().nullable(),
    category: z.string().trim().optional().nullable(),
    purpose: z.string().trim().optional().nullable(),
    occasionName: z.string().trim().optional().nullable(),
    occasionRelation: z.string().trim().optional().nullable(),
    occasionDate: z.string().or(z.date()).optional().nullable(),
    occasionMobile: z.string().trim().optional().nullable(),
    recurringPlan: z.string().trim().optional().nullable(),
    preferredPrayerDate: z.string().or(z.date()).optional().nullable(),
    honouredPersonImage: z.string().trim().optional().nullable(),
    specialPrayerMessage: z.string().trim().optional().nullable(),
    wishToVisitHome: z.boolean().optional(),
    preferredVisitDate: z.string().or(z.date()).optional().nullable(),
    taxDeduction: z.boolean().optional(),
    receivedBy: z.string().trim().optional().nullable(),
    verifiedBy: z.string().trim().optional().nullable(),

    references: z.array(z.object({
        name: z.string().trim().min(1, 'Reference name cannot be empty'),
        mobile: z.string().trim().optional().nullable()
    })).optional()
}).refine(data => {
    // Donor identity rule: must provide either existing donorId, non-empty name, or explicit isAnonymous flag
    if (!data.donorId && !data.isAnonymous && (!data.name || data.name.trim().length === 0)) {
        return false;
    }
    return true;
}, {
    message: 'Donor name is required unless donorId is provided or isAnonymous is true',
    path: ['name']
}).refine(data => {
    // Amount rule:
    // If MATERIAL donation, amount can be 0 if materialDetails is provided.
    // In all monetary donation modes (CASH, CHEQUE, ONLINE, UPI, BANK_TRANSFER, etc.), amount must be > 0.
    if (data.paymentMode?.toUpperCase() === 'MATERIAL') {
        const hasMaterial = data.materialDetails && data.materialDetails.trim().length > 0;
        return hasMaterial || (typeof data.amount === 'number' && data.amount > 0);
    }
    return typeof data.amount === 'number' && data.amount > 0;
}, {
    message: 'Donation amount must be greater than 0 (or materialDetails provided for MATERIAL donations)',
    path: ['amount']
});

export const markReceiptSentSchema = z.object({
    id: z.string().uuid('Invalid donation ID format: must be a valid UUID')
});

function generateReceiptNo(count: number): string {
    return `UNCF-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
}

router.get('/', async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const donations = await prisma.donation.findMany({
            where: {
                tenantId,
                isDeleted: false
            },
            include: {
                donor: true
            },
            orderBy: {
                date: 'desc'
            }
        });
        res.json({ success: true, data: donations });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/:id', async (req: any, res: any) => {
    try {
        const tenantId = req.user.tenantId;
        const donation = await prisma.donation.findFirst({
            where: {
                id: req.params.id,
                tenantId,
                isDeleted: false
            },
            include: {
                donor: true,
                references: true
            }
        });
        if (!donation) return res.status(404).json({ success: false, message: 'Donation not found' });
        res.json({ success: true, data: donation });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/', async (req: any, res: any) => {
    try {
        // Validation barrier: execute schema parse before any database operation
        const validated = createDonationSchema.parse(req.body);

        const tenantId = req.user.tenantId;
        const unitId = req.user.unitId || null;

        const result = await (prisma as any).$transaction(async (tx: any) => {
            let donor = null;
            if (validated.donorId) {
                donor = await tx.donor.findFirst({ where: { id: validated.donorId, tenantId } });
            } else if (validated.mobile) {
                donor = await tx.donor.findFirst({ where: { mobile: validated.mobile, tenantId } });
            }

            const donorName = validated.name || (validated.isAnonymous ? 'Anonymous' : 'Anonymous');

            if (!donor) {
                const donorCount = await tx.donor.count({ where: { tenantId } });
                donor = await tx.donor.create({
                    data: {
                        tenantId,
                        unitId,
                        donorNo: `DNR-${new Date().getFullYear()}-${String(donorCount + 1).padStart(4, '0')}`,
                        name: donorName,
                        fatherOrHusbandName: validated.fatherOrHusbandName || null,
                        residentialAddress: validated.residentialAddress || null,
                        permanentAddress: validated.permanentAddress || null,
                        mobile: validated.mobile || null,
                        whatsappNumber: validated.whatsappNumber || null,
                        email: validated.email || null,
                        panNumber: validated.panNumber || null,
                        dob: validated.dob ? new Date(validated.dob) : null,
                        isCorporate: validated.isCorporate === true,
                        createdBy: req.user.id
                    }
                });
            } else {
                // Update donor info if newer info is provided
                donor = await tx.donor.update({
                    where: { id: donor.id },
                    data: {
                        fatherOrHusbandName: validated.fatherOrHusbandName || donor.fatherOrHusbandName,
                        residentialAddress: validated.residentialAddress || donor.residentialAddress,
                        permanentAddress: validated.permanentAddress || donor.permanentAddress,
                        whatsappNumber: validated.whatsappNumber || donor.whatsappNumber,
                        email: validated.email || donor.email,
                        panNumber: validated.panNumber || donor.panNumber,
                        isCorporate: validated.isCorporate ?? donor.isCorporate
                    }
                });
            }

            const receiptCount = await tx.donation.count({ where: { tenantId } });
            const donation = await tx.donation.create({
                data: {
                    tenantId,
                    unitId,
                    donorId: donor.id,
                    receiptNo: generateReceiptNo(receiptCount),
                    amount: validated.amount,
                    amountInWords: validated.amountInWords || null,
                    paymentMode: validated.paymentMode,
                    materialDetails: validated.materialDetails || null,
                    category: validated.category || null,
                    purpose: validated.purpose || null,
                    occasionName: validated.occasionName || null,
                    occasionRelation: validated.occasionRelation || null,
                    occasionDate: validated.occasionDate ? new Date(validated.occasionDate) : null,
                    occasionMobile: validated.occasionMobile || null,
                    recurringPlan: validated.recurringPlan || null,
                    preferredPrayerDate: validated.preferredPrayerDate ? new Date(validated.preferredPrayerDate) : null,
                    honouredPersonImage: validated.honouredPersonImage || null,
                    specialPrayerMessage: validated.specialPrayerMessage || null,
                    wishToVisitHome: validated.wishToVisitHome === true,
                    preferredVisitDate: validated.preferredVisitDate ? new Date(validated.preferredVisitDate) : null,
                    taxDeduction: validated.taxDeduction === true,
                    receivedBy: validated.receivedBy || req.user.name,
                    verifiedBy: validated.verifiedBy || null,
                    createdBy: req.user.id
                }
            });

            if (validated.references && Array.isArray(validated.references)) {
                for (const ref of validated.references) {
                    if (ref.name) {
                        await tx.donationReference.create({
                            data: {
                                tenantId,
                                donationId: donation.id,
                                name: ref.name,
                                mobile: ref.mobile || null
                            }
                        });
                    }
                }
            }

            return await tx.donation.findUnique({
                where: { id: donation.id },
                include: { donor: true, references: true }
            });
        });

        res.json({ success: true, data: result, message: 'Donation recorded successfully' });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            const issues = (error as any).issues || (error as any).errors || [];
            const message = issues.map((e: any) => e.message).join('; ') || error.message;
            return res.status(400).json({
                success: false,
                message,
                errors: issues
            });
        }
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
    }
});

router.patch('/:id/mark-sent', async (req: any, res: any) => {
    try {
        // Validate params
        const { id } = markReceiptSentSchema.parse(req.params);

        const tenantId = req.user.tenantId;
        const donation = await prisma.donation.updateMany({
            where: {
                id,
                tenantId
            },
            data: {
                isReceiptSent: true,
                receiptSentAt: new Date()
            }
        });
        
        if (donation.count === 0) {
            return res.status(404).json({ success: false, message: 'Donation not found' });
        }
        
        res.json({ success: true, message: 'Receipt marked as sent' });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            const issues = (error as any).issues || (error as any).errors || [];
            const message = issues.map((e: any) => e.message).join('; ') || error.message;
            return res.status(400).json({
                success: false,
                message,
                errors: issues
            });
        }
        res.status(500).json({ success: false, message: error.message });
    }
});

export default router;
