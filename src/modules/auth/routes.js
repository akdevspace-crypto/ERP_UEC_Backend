import { Router } from 'express';
import { login, forgotPassword, resetPassword, handleChangeTemporaryPassword, handleChangePassword } from './controller.js';
import { forgotPasswordLimiter, resetPasswordLimiter } from '../../middleware/rateLimiter.js';
import { auth } from '../../shared/middleware/auth.middleware.js';

const router = Router();

router.post('/login', login);
router.post('/forgot-password', forgotPasswordLimiter, forgotPassword);
router.post('/reset-password', resetPasswordLimiter, resetPassword);
router.post('/change-temporary-password', auth, handleChangeTemporaryPassword);
router.post('/change-password', auth, handleChangePassword);

export default router;
