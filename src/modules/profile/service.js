import { prisma } from '../../app/prisma.js';
import { buildSessionUser } from '../auth/access.js';

const isMissingStaffTable = (error) => error?.code === 'P2021' && error?.meta?.table === 'public.Staff';

const findProfileUser = async (userId) => {
    try {
        return await prisma.user.findUnique({
            where: { id: userId, isDeleted: false },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                mobile: true,
                createdAt: true,
                role: {
                    select: {
                        id: true,
                        name: true,
                        description: true
                    }
                },
                unit: {
                    select: {
                        id: true,
                        name: true,
                        code: true
                    }
                },
                tenant: {
                    select: {
                        name: true
                    }
                },
                tenantId: true,
                unitId: true,
                staff: {
                    select: {
                        id: true,
                        empId: true,
                        userId: true,
                        metadata: true
                    }
                }
            }
        });
    } catch (error) {
        if (!isMissingStaffTable(error)) throw error;

        const user = await prisma.user.findUnique({
            where: { id: userId, isDeleted: false },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                mobile: true,
                createdAt: true,
                role: {
                    select: {
                        id: true,
                        name: true,
                        description: true
                    }
                },
                unit: {
                    select: {
                        id: true,
                        name: true,
                        code: true
                    }
                },
                tenant: {
                    select: {
                        name: true
                    }
                }
            }
        });

        return user ? { ...user, staff: null } : null;
    }
};

export const getProfileInfo = async (userId) => {
    const user = await findProfileUser(userId);

    if (!user) throw new Error('User profile not found');

    const sessionUser = buildSessionUser(user);

    return {
        empId: user.id.split('-')[0], // derived employee ID
        name: `${user.firstName} ${user.lastName || ''}`.trim(),
        role: user.role?.name || 'Employee',
        department: user.role?.description || user.role?.name || 'General',
        unitId: user.unit ? `${user.unit.code} ${user.unit.name}` : user.unitId,
        phone: user.mobile || 'N/A',
        email: user.email,
        joiningDate: user.createdAt.toISOString().split('T')[0],
        sessionUser
    };
};

export const updateProfileInfo = async (userId, data) => {
    if (Object.keys(data).length === 0) {
        return getProfileInfo(userId);
    }
    
    await prisma.user.update({
        where: { id: userId },
        data
    });
    
    return getProfileInfo(userId);
};
