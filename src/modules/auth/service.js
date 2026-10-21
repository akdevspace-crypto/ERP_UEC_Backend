import { prisma } from '../../app/prisma.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { buildSessionUser } from './access.js';
import { AppError } from '../../shared/utils/response.js';
import { sendEmail } from '../../shared/utils/email.js';
import { logAudit } from '../audit/service.js';

const isMissingStaffTable = (error) => error?.code === 'P2021' && error?.meta?.table === 'public.Staff';

const userLoginInclude = {
    role: true,
    tenant: true,
    unit: true,
    staff: {
        select: {
            id: true,
            empId: true,
            metadata: true
        }
    }
};

const userLoginIncludeWithoutStaff = {
    role: true,
    tenant: true,
    unit: true
};

const findLoginUser = async (email) => {
    const normalizedEmail = String(email || '').trim();

    try {
        return await prisma.user.findFirst({
            where: {
                email: {
                    equals: normalizedEmail,
                    mode: 'insensitive'
                }
            },
            include: userLoginInclude
        });
    } catch (error) {
        if (!isMissingStaffTable(error)) throw error;

        const user = await prisma.user.findFirst({
            where: {
                email: {
                    equals: normalizedEmail,
                    mode: 'insensitive'
                }
            },
            include: userLoginIncludeWithoutStaff
        });

        return user ? { ...user, staff: null } : null;
    }
};

export const loginUser = async ({ email, password }) => {
    const user = await findLoginUser(email);

    if (!user || user.isDeleted || !user.passwordHash) {
        throw new AppError('Invalid credentials', 401);
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
        throw new AppError('Invalid credentials', 401);
    }

    if (!user.isActive) {
        throw new AppError('User account is disabled', 403);
    }

    const payload = {
        id: user.id,
        email: user.email,
        roleId: user.roleId,
        tenantId: user.tenantId,
        unitId: user.unitId
    };

    const accessToken = jwt.sign(payload, process.env.JWT_SECRET || 'supersecretjwtkeyforerpsystem', {
        expiresIn: process.env.JWT_EXPIRES_IN || '1d'
    });

    const refreshToken = jwt.sign(payload, process.env.JWT_SECRET || 'supersecretjwtkeyforerpsystem', {
        expiresIn: '7d'
    });

    return {
        user: buildSessionUser(user),
        accessToken,
        refreshToken
    };
};

export const requestPasswordReset = async (email) => {
    const normalizedEmail = String(email || '').trim();
    if (!normalizedEmail) return;

    const user = await prisma.user.findFirst({
        where: {
            email: { equals: normalizedEmail, mode: 'insensitive' },
            isDeleted: false,
            isActive: true
        }
    });

    if (!user) {
        // Return silently to prevent email enumeration
        return;
    }

    // Invalidate previous tokens
    await prisma.passwordResetToken.updateMany({
        where: { userId: user.id, isUsed: false },
        data: { isUsed: true }
    });

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.passwordResetToken.create({
        data: {
            userId: user.id,
            tokenHash,
            expiresAt
        }
    });

    // Send email safely
    const baseUrl = process.env.BASE_URL || 'http://localhost:5173';
    const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`;
    
    await sendEmail({
        to: user.email,
        subject: 'Password Reset Request',
        text: `You requested a password reset. Please use the following link to reset your password: ${resetUrl}\nThis link will expire in 15 minutes.`,
        html: `<p>You requested a password reset. Please click the link below to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link will expire in 15 minutes.</p>`
    });

    await logAudit({
        userId: user.id,
        module: 'Auth',
        action: 'PASSWORD_RESET_REQUESTED',
        tenantId: user.tenantId,
        unitId: user.unitId
    });
};

export const resetUserPassword = async (rawToken, newPassword) => {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const tokenRecord = await prisma.passwordResetToken.findUnique({
        where: { tokenHash },
        include: { user: true }
    });

    if (!tokenRecord || tokenRecord.isUsed) {
        throw new AppError('Invalid or expired reset token', 400);
    }

    if (tokenRecord.expiresAt < new Date()) {
        throw new AppError('Invalid or expired reset token', 400);
    }

    if (tokenRecord.user.isDeleted) {
        throw new AppError('User account is deleted', 403);
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    await prisma.$transaction([
        prisma.user.update({
            where: { id: tokenRecord.userId },
            data: { passwordHash: newPasswordHash, mustChangePassword: false, tokenVersion: { increment: 1 } }
        }),
        prisma.passwordResetToken.update({
            where: { id: tokenRecord.id },
            data: { isUsed: true }
        })
    ]);

    await logAudit({
        userId: tokenRecord.userId,
        module: 'Auth',
        action: 'PASSWORD_RESET_COMPLETED',
        tenantId: tokenRecord.user.tenantId,
        unitId: tokenRecord.user.unitId
    });
};

export const changeTemporaryPassword = async (userId, currentPassword, newPassword) => {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.isDeleted) throw new AppError('User not found', 404);
    if (!user.mustChangePassword) throw new AppError('Password change not required', 400);

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) throw new AppError('Invalid current password', 401);

    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    
    await prisma.user.update({
        where: { id: userId },
        data: { passwordHash: newPasswordHash, mustChangePassword: false, tokenVersion: { increment: 1 } }
    });

    await logAudit({
        userId,
        module: 'Auth',
        action: 'FORCED_PASSWORD_CHANGE_COMPLETED',
        tenantId: user.tenantId,
        unitId: user.unitId
    });
};

export const changePassword = async (userId, currentPassword, newPassword) => {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.isDeleted) throw new AppError('User not found', 404);

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) throw new AppError('Invalid current password', 401);

    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    
    await prisma.user.update({
        where: { id: userId },
        data: { passwordHash: newPasswordHash, mustChangePassword: false, tokenVersion: { increment: 1 } }
    });

    await logAudit({
        userId,
        module: 'Auth',
        action: 'PASSWORD_CHANGE_COMPLETED',
        tenantId: user.tenantId,
        unitId: user.unitId
    });
};
