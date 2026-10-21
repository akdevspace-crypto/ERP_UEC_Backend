import { Router } from 'express';
import { handleGetProfile, handleUpdateProfile } from './controller.js';
import { protect } from '../../shared/middleware/auth.middleware.js';
import { enforceTenant } from '../../shared/middleware/tenant.middleware.js';

const router = Router();

router.use(protect);
router.use(enforceTenant);

router.get('/me', handleGetProfile);
router.patch('/me', handleUpdateProfile);

export default router;
