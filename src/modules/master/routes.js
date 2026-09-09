import { Router } from 'express';
import cityRoutes from './city/routes.js';
import unitRoutes from './unit/routes.js';
import clientServiceRoutes from './client-service/routes.js';
import departmentRoutes from './department/routes.js';
import labourServiceRoutes from './labour-service/routes.js';
import paymentCategoryRoutes from './payment-category/routes.js';
import vendorRoutes from './vendor/routes.js';
import roomRoutes from './room/routes.js';

import { auth, enforceTenant } from '../../shared/middleware/auth.middleware.js';

const router = Router();

// Apply authentication and tenant isolation to all master routes
router.use(auth);
router.use(enforceTenant);

router.use('/city', cityRoutes);
router.use(['/unit', '/units'], unitRoutes);
router.use('/client-service', clientServiceRoutes);
router.use('/department', departmentRoutes);
router.use('/labour-service', labourServiceRoutes);
router.use('/payment-category', paymentCategoryRoutes);
router.use('/vendor', vendorRoutes);

// Intercept floors and beds
router.get('/floors', async (req, res, next) => {
    try {
        const { prisma } = await import('../../app/prisma.js');
        const unitId = req.query.unitId;
        const rooms = await prisma.room.findMany({
            where: { unitId, tenantId: req.user.tenantId, isDeleted: false },
            select: { floor: true }
        });
        const floors = [...new Set(rooms.map(r => r.floor).filter(Boolean))].sort();
        res.json({ success: true, data: floors.map(f => ({ id: f, name: f })) });
    } catch (e) { next(e); }
});

router.get('/beds', async (req, res, next) => {
    try {
        const { prisma } = await import('../../app/prisma.js');
        const roomId = req.query.roomId;
        const room = await prisma.room.findFirst({ where: { id: roomId, isDeleted: false } });
        if (!room) return res.json({ success: true, data: [] });
        
        const admissions = await prisma.admission.findMany({
            where: { room: roomId, status: 'ACTIVE' },
            select: { bed: true }
        });
        const occupied = admissions.map(a => String(a.bed));
        
        const beds = [];
        for (let i = 1; i <= room.capacity; i++) {
            const bedName = `Bed ${i}`;
            if (!occupied.includes(bedName)) {
                beds.push({ id: bedName, name: bedName });
            }
        }
        res.json({ success: true, data: beds });
    } catch (e) { next(e); }
});

router.use(['/room', '/rooms'], roomRoutes);

export default router;
