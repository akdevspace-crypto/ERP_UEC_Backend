import { loginUser, requestPasswordReset, resetUserPassword } from './service.js';
import { loginSchema, forgotPasswordSchema, resetPasswordSchema } from './schema.js';
import { success } from '../../shared/utils/response.js';

export const login = async (req, res, next) => {
    try {
        const validatedData = loginSchema.parse(req.body);
        const result = await loginUser(validatedData);

        return success(res, result, { message: 'Login successful' });
    } catch (error) {
        next(error);
    }
};

export const forgotPassword = async (req, res, next) => {
    try {
        const { email } = forgotPasswordSchema.parse(req.body);
        await requestPasswordReset(email);
        return success(res, null, { message: 'If an account exists for this email, password reset instructions have been sent.' });
    } catch (error) {
        next(error);
    }
};

export const resetPassword = async (req, res, next) => {
    try {
        const { token, newPassword } = resetPasswordSchema.parse(req.body);
        await resetUserPassword(token, newPassword);
        return success(res, null, { message: 'Password successfully reset' });
    } catch (error) {
        next(error);
    }
};

export const handleChangeTemporaryPassword = async (req, res, next) => {
    try {
        const { changeTemporaryPasswordSchema } = await import('./schema.js');
        const validatedData = changeTemporaryPasswordSchema.parse(req.body);
        const { changeTemporaryPassword } = await import('./service.js');
        await changeTemporaryPassword(req.user.id, validatedData.currentPassword, validatedData.newPassword);
        return success(res, null, { message: 'Password changed successfully' });
    } catch (error) {
        next(error);
    }
};

export const handleChangePassword = async (req, res, next) => {
    try {
        const { changeTemporaryPasswordSchema } = await import('./schema.js');
        const validatedData = changeTemporaryPasswordSchema.parse(req.body);
        const { changePassword } = await import('./service.js');
        await changePassword(req.user.id, validatedData.currentPassword, validatedData.newPassword);
        return success(res, null, { message: 'Password changed successfully' });
    } catch (error) {
        next(error);
    }
};
