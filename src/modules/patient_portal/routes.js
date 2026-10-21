import { Router } from 'express';
import { prisma } from '../../app/prisma.js';
import jwt from 'jsonwebtoken';

const router = Router();

// Helper for HTTP errors
const buildHttpError = (message, status = 400) => {
    const error = new Error(message);
    error.status = status;
    error.statusCode = status;
    return error;
};

// Middleware to protect portal routes
const portalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
        if (!token) throw buildHttpError('No token provided', 401);

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
        
        const session = await prisma.patientPortalSession.findUnique({
            where: { token }
        });

        if (!session || session.expiresAt < new Date()) {
            throw buildHttpError('Session expired or invalid', 401);
        }

        const account = await prisma.patientPortalAccount.findUnique({
            where: { id: session.accountId }
        });

        if (!account) {
            throw buildHttpError('Account not found', 401);
        }

        req.portalUser = account;
        next();
    } catch (err) {
        next(buildHttpError(err.message || 'Unauthorized', 401));
    }
};

// 0. Public Quick Admitted Patients List (for family lookup & demo convenience)
router.get('/admitted-residents', async (req, res, next) => {
    try {
        const admissions = await prisma.admission.findMany({
            where: { status: 'ACTIVE' },
            include: {
                patient: true,
                enquiry: {
                    include: { client: true }
                }
            },
            orderBy: { admittedAt: 'desc' },
            take: 25
        });

        const list = admissions.map(a => ({
            admissionId: a.id,
            patientId: a.patientId,
            patientName: a.patient?.name || 'Resident',
            room: a.room || 'General Ward',
            bed: a.bed || 'Bed 1',
            floor: a.floor || 'Ground Floor',
            admittedAt: a.admittedAt,
            healthCondition: a.healthCondition || 'Stable',
            clinicalStatus: a.clinicalStatus || 'Ambulatory',
            guardianName: a.enquiry?.client?.name || 'Family Sponsor',
            guardianMobile: a.enquiry?.client?.mobile || a.patient?.phone || '9101603847',
            guardianEmail: a.enquiry?.client?.email || a.patient?.email || ''
        }));

        res.json({ success: true, data: list });
    } catch (err) {
        next(err);
    }
});

// 1. Auth: Login (Authenticates existing portal accounts or auto-provisions verified resident family contacts)
router.post('/login', async (req, res, next) => {
    try {
        const { mobile, password, patientId: requestedPatientId } = req.body;
        if (!mobile) throw buildHttpError('Mobile number is required');

        const cleanMobile = String(mobile).trim();
        const rawPhone10 = cleanMobile.replace(/\D/g, '').slice(-10);

        let account = await prisma.patientPortalAccount.findFirst({
            where: {
                OR: [
                    { mobile: cleanMobile },
                    { mobile: rawPhone10 }
                ]
            }
        });

        // Safety check on existing account: ensure account is linked to the real admitted resident for this phone
        if (account) {
            const matchingAdmission = await prisma.admission.findFirst({
                where: {
                    status: 'ACTIVE',
                    patient: {
                        OR: [
                            { phone: { contains: rawPhone10 } },
                            { emergencyContact: { contains: rawPhone10 } }
                        ]
                    }
                },
                include: { patient: true },
                orderBy: { admittedAt: 'desc' }
            });
            if (matchingAdmission?.patient && matchingAdmission.patient.id !== account.patientId) {
                account = await prisma.patientPortalAccount.update({
                    where: { id: account.id },
                    data: {
                        patientId: matchingAdmission.patient.id,
                        name: matchingAdmission.patient.primaryContact || ('Guardian of ' + matchingAdmission.patient.name)
                    }
                });
            }
        }

        // If no explicit portal account, find matching Admission or Client by mobile
        if (!account) {
            let activePatientId = requestedPatientId || null;
            let residentName = 'Resident';
            let tenantId = 'e083527d-cf59-4291-8c00-6adfba220c8e';
            let unitId = '5d117c8d-8b1f-4940-8cc0-ed430c5ab987';
            let guardianName = null;

            // 1. Direct match on active admission by patient's phone or emergencyContact
            const admissionByPatient = await prisma.admission.findFirst({
                where: {
                    status: 'ACTIVE',
                    patient: {
                        OR: [
                            { phone: { contains: rawPhone10 } },
                            { emergencyContact: { contains: rawPhone10 } }
                        ]
                    }
                },
                include: { patient: true, enquiry: { include: { client: true } } },
                orderBy: { admittedAt: 'desc' }
            });

            if (admissionByPatient?.patient) {
                activePatientId = admissionByPatient.patient.id;
                residentName = admissionByPatient.patient.name;
                tenantId = admissionByPatient.tenantId;
                unitId = admissionByPatient.unitId;
                guardianName = admissionByPatient.enquiry?.client?.name || admissionByPatient.patient.primaryContact || ('Guardian of ' + residentName);
            }

            // 2. Match client with admitted patient
            if (!activePatientId) {
                let client = await prisma.client.findFirst({
                    where: {
                        OR: [
                            { mobile: { contains: rawPhone10 } },
                            { email: cleanMobile }
                        ],
                        isDeleted: false
                    },
                    include: {
                        enquiries: {
                            include: {
                                admission: {
                                    include: { patient: true }
                                }
                            }
                        }
                    }
                });

                if (client) {
                    tenantId = client.tenantId || tenantId;
                    unitId = client.unitId || unitId;
                    const admission = client.enquiries?.map(e => e.admission)?.find(a => a && a.status === 'ACTIVE' && a.patient);
                    if (admission?.patient) {
                        activePatientId = admission.patient.id;
                        residentName = admission.patient.name;
                        guardianName = client.name || ('Guardian of ' + residentName);
                    }
                }
            }

            if (activePatientId) {
                account = await prisma.patientPortalAccount.create({
                    data: {
                        patientId: activePatientId,
                        mobile: cleanMobile,
                        password: password || '123456',
                        name: guardianName || ('Guardian of ' + residentName),
                        tenantId,
                        unitId
                    }
                });
            }
        }

        if (!account) {
            throw buildHttpError('No admitted resident found for this phone number. Please check with facility administration.', 401);
        }

        if (password && account.password && account.password !== password) {
            throw buildHttpError('Invalid password. Please check your credentials.', 401);
        }

        // Fetch patient details for display
        const patient = await prisma.patient.findUnique({
            where: { id: account.patientId }
        });

        const activeAdmission = await prisma.admission.findFirst({
            where: { patientId: account.patientId, status: 'ACTIVE' },
            orderBy: { admittedAt: 'desc' }
        });

        const token = jwt.sign(
            { accountId: account.id, patientId: account.patientId }, 
            process.env.JWT_SECRET || 'fallback_secret', 
            { expiresIn: '30d' }
        );

        await prisma.patientPortalSession.create({
            data: {
                accountId: account.id,
                token,
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            }
        });

        res.json({
            success: true,
            data: {
                token,
                account: {
                    id: account.id,
                    name: account.name,
                    mobile: account.mobile,
                    patientId: account.patientId,
                    patientName: patient?.name || 'Resident',
                    room: activeAdmission?.room || 'Room 101',
                    bed: activeAdmission?.bed || 'Bed A',
                    floor: activeAdmission?.floor || 'Ground Floor',
                    admittedAt: activeAdmission?.admittedAt || null,
                    clinicalStatus: activeAdmission?.clinicalStatus || 'Stable'
                }
            }
        });
    } catch (err) {
        next(err);
    }
});

// 2. Auth: Logout
router.post('/logout', portalAuth, async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (token) {
            await prisma.patientPortalSession.deleteMany({
                where: { token }
            });
        }
        res.json({ success: true, message: 'Logged out successfully' });
    } catch (err) {
        next(err);
    }
});

// 3. Get Complete Resident Dashboard Data (Patient, Room, Vitals, Meds, Diet, ADL, Daily Costs)
router.get('/dashboard', portalAuth, async (req, res, next) => {
    try {
        const { patientId } = req.portalUser;

        const patient = await prisma.patient.findUnique({
            where: { id: patientId }
        });

        const activeAdmission = await prisma.admission.findFirst({
            where: { patientId, status: 'ACTIVE' },
            orderBy: { admittedAt: 'desc' },
            include: {
                enquiry: { include: { client: true } }
            }
        });

        // 1. Vital Signs (recent recordings)
        const vitals = await prisma.vitalSign.findMany({
            where: { patientId },
            orderBy: { recordedAt: 'desc' },
            take: 20
        });

        // 2. Caregiver Vital Chart (Monthly chart with morning/evening temp, BP, SpO2, Pulse)
        const caregiverVitalCharts = await prisma.$queryRaw`
            SELECT * FROM "CaregiverVitalChart"
            WHERE "patientId" = ${patientId} AND "isDeleted" = false
            ORDER BY "month" DESC LIMIT 2
        `.catch(() => []);

        // 3. Medications & Schedule
        const medications = await prisma.medication.findMany({
            where: { patientId },
            orderBy: { createdAt: 'desc' }
        });

        // 4. Prescriptions
        const prescriptions = await prisma.prescription.findMany({
            where: { patientId },
            orderBy: { createdAt: 'desc' },
            take: 10
        }).catch(() => []);

        // 5. Nutrition & Diet
        const nutritions = await prisma.nutrition.findMany({
            where: { patientId },
            orderBy: { createdAt: 'desc' },
            take: 10
        });

        // 6. Doctor Consultations
        const doctorVisits = await prisma.doctorVisit.findMany({
            where: { patientId },
            orderBy: { visitDate: 'desc' },
            take: 10
        }).catch(() => []);

        // 7. ADL Records
        const adlRecords = await prisma.auditLog.findMany({
            where: {
                module: 'HEALTHCARE_ADL',
                action: 'DAILY_LIVING',
                isDeleted: false
            },
            orderBy: { createdAt: 'desc' },
            take: 20
        }).then(records => records.filter(r => r.payload?.patientId === patientId)).catch(() => []);

        // 8. Daily In-House Costs
        const dailyCosts = await prisma.patientDailyCost.findMany({
            where: { patientId, isDeleted: false },
            orderBy: { costDate: 'desc' },
            take: 30
        }).catch(() => []);

        // 9. Invoices
        const invoices = await prisma.invoice.findMany({
            where: { patientId },
            orderBy: { createdAt: 'desc' },
            take: 15
        }).catch(() => []);

        res.json({
            success: true,
            data: {
                resident: {
                    id: patient?.id,
                    name: patient?.name,
                    gender: patient?.gender || 'Not specified',
                    age: patient?.age || null,
                    bloodGroup: patient?.bloodGroup || '-',
                    primaryContact: patient?.primaryContact || '',
                    room: activeAdmission?.room || 'Room 101',
                    bed: activeAdmission?.bed || 'Bed 1',
                    floor: activeAdmission?.floor || 'Ground Floor',
                    admittedAt: activeAdmission?.admittedAt,
                    healthCondition: activeAdmission?.healthCondition || 'Stable',
                    clinicalStatus: activeAdmission?.clinicalStatus || 'Under observation',
                    guardianName: activeAdmission?.enquiry?.client?.name || req.portalUser.name,
                    guardianMobile: activeAdmission?.enquiry?.client?.mobile || req.portalUser.mobile
                },
                vitals,
                caregiverVitalCharts,
                medications,
                prescriptions,
                nutritions,
                doctorVisits,
                adlRecords,
                dailyCosts,
                invoices
            }
        });
    } catch (err) {
        next(err);
    }
});

// 4. Get Billing/Invoices & Daily Ledger
router.get('/billing', portalAuth, async (req, res, next) => {
    try {
        const { patientId } = req.portalUser;

        const invoices = await prisma.invoice.findMany({
            where: { patientId },
            orderBy: { createdAt: 'desc' }
        }).catch(() => []);

        const dailyCosts = await prisma.patientDailyCost.findMany({
            where: { patientId, isDeleted: false },
            orderBy: { costDate: 'desc' }
        }).catch(() => []);

        const totalBilled = dailyCosts.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
        const paidItems = dailyCosts.filter(c => c.status === 'PAID');
        const totalPaid = paidItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
        const totalBalance = Math.max(0, totalBilled - totalPaid);

        res.json({
            success: true,
            data: {
                invoices,
                dailyCosts,
                summary: {
                    totalBilled,
                    totalPaid,
                    totalBalance,
                    itemCount: dailyCosts.length
                }
            }
        });
    } catch (err) {
        next(err);
    }
});

// 5. Guardian Complaints & Service Requests
router.get('/complaints', portalAuth, async (req, res, next) => {
    try {
        const { patientId } = req.portalUser;
        const complaints = await prisma.auditLog.findMany({
            where: {
                module: 'CUSTOMER_CARE',
                action: 'COMPLAINT',
                isDeleted: false
            },
            orderBy: { createdAt: 'desc' },
            take: 30
        }).then(records => records.filter(r => r.payload?.patientId === patientId || r.payload?.mobile === req.portalUser.mobile)).catch(() => []);

        res.json({
            success: true,
            data: complaints.map(c => ({
                id: c.id,
                title: c.payload?.title || c.payload?.category || 'Service Request',
                category: c.payload?.category || 'General Care',
                priority: c.payload?.priority || 'Normal',
                status: c.payload?.status || 'Open',
                description: c.payload?.description || '',
                createdAt: c.createdAt
            }))
        });
    } catch (err) {
        next(err);
    }
});

router.post('/complaints', portalAuth, async (req, res, next) => {
    try {
        const { category, priority, description, title } = req.body;
        if (!description) throw buildHttpError('Description is required');

        const record = await prisma.auditLog.create({
            data: {
                module: 'CUSTOMER_CARE',
                action: 'COMPLAINT',
                tenantId: req.portalUser.tenantId,
                userId: req.portalUser.id,
                payload: {
                    patientId: req.portalUser.patientId,
                    guardianName: req.portalUser.name,
                    mobile: req.portalUser.mobile,
                    title: title || category || 'Family Inquiry',
                    category: category || 'Care Support',
                    priority: priority || 'Normal',
                    status: 'Open',
                    description
                }
            }
        });

        res.json({
            success: true,
            message: 'Feedback/Request submitted successfully to the floor supervisor.',
            data: record
        });
    } catch (err) {
        next(err);
    }
});

export default router;
