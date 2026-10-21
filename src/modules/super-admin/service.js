import bcrypt from 'bcrypt';
import { prisma } from '../../app/prisma.js';

const buildHttpError = (message, status = 400) => {
    const error = new Error(message);
    error.status = status;
    return error;
};

const userSelect = {
    id: true,
    email: true,
    firstName: true,
    lastName: true,
    mobile: true,
    roleId: true,
    unitId: true,
    tenantId: true,
    isActive: true,
    isDeleted: true,
    createdAt: true,
    updatedAt: true,
    role: { select: { id: true, name: true } },
    unit: { select: { id: true, name: true, code: true } },
    staff: { select: { id: true, empId: true, firstName: true, lastName: true } }
};

const resolveRole = async (tenantId, roleId) => {
    const role = await prisma.role.findFirst({
        where: { tenantId, isDeleted: false, OR: [{ id: roleId }, { name: roleId }] }
    });

    if (!role) throw buildHttpError('Invalid role selected', 400);
    return role;
};

const resolveUnit = async (tenantId, unitId) => {
    const unit = await prisma.unit.findFirst({
        where: { id: unitId, tenantId, isDeleted: false }
    });

    if (!unit) throw buildHttpError('Invalid unit selected', 400);
    return unit;
};

export const listUsers = async (tenantId) => {
    return prisma.user.findMany({
        where: { tenantId, isDeleted: false },
        select: userSelect,
        orderBy: { createdAt: 'desc' }
    });
};

export const createUser = async (tenantId, data) => {
    const normalizedEmail = String(data.email || '').trim().toLowerCase();
    const existingUser = await prisma.user.findFirst({
        where: { email: normalizedEmail, isDeleted: false },
        select: { id: true }
    });

    if (existingUser) throw buildHttpError('Email is already in use', 409);

    const [role, unit] = await Promise.all([
        resolveRole(tenantId, data.roleId),
        resolveUnit(tenantId, data.unitId)
    ]);

    const passwordHash = await bcrypt.hash(data.password, 10);

    return prisma.user.create({
        data: {
            email: normalizedEmail,
            passwordHash,
            firstName: data.firstName,
            lastName: data.lastName || null,
            mobile: data.mobile || null,
            roleId: role.id,
            tenantId,
            unitId: unit.id,
            isActive: data.isActive ?? true
        },
        select: userSelect
    });
};

export const updateUser = async (tenantId, userId, data) => {
    const normalizedEmail = String(data.email || '').trim().toLowerCase();
    const user = await prisma.user.findFirst({
        where: { id: userId, tenantId, isDeleted: false },
        select: { id: true, email: true }
    });

    if (!user) throw buildHttpError('User not found', 404);

    if (normalizedEmail && normalizedEmail !== user.email) {
        const existingUser = await prisma.user.findFirst({
            where: { email: normalizedEmail, isDeleted: false, id: { not: userId } },
            select: { id: true }
        });

        if (existingUser) throw buildHttpError('Email is already in use', 409);
    }

    const [role, unit] = await Promise.all([
        resolveRole(tenantId, data.roleId),
        resolveUnit(tenantId, data.unitId)
    ]);

    const updateData = {
        email: normalizedEmail,
        firstName: data.firstName,
        lastName: data.lastName || null,
        mobile: data.mobile || null,
        roleId: role.id,
        unitId: unit.id,
        isActive: data.isActive ?? true
    };

    if (data.password) {
        updateData.passwordHash = await bcrypt.hash(data.password, 10);
        updateData.tokenVersion = { increment: 1 };
    }

    return prisma.user.update({
        where: { id: userId },
        data: updateData,
        select: userSelect
    });
};

export const deleteUser = async (tenantId, userId, actorUserId) => {
    if (userId === actorUserId) {
        throw buildHttpError('You cannot delete your own user account', 400);
    }

    const user = await prisma.user.findFirst({
        where: { id: userId, tenantId, isDeleted: false },
        select: { id: true }
    });

    if (!user) throw buildHttpError('User not found', 404);

    await prisma.user.update({
        where: { id: userId },
        data: {
            isActive: false,
            isDeleted: true,
            deletedAt: new Date()
        }
    });
};
