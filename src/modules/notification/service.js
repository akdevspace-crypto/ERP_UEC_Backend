import { emitRealtimeEvent } from '../../shared/services/socket.js';
import { prisma } from '../../app/prisma.js';

export const sendNotification = async (params) => {
    try {
        const {
            userId,
            title = 'System Notification',
            body,
            message,
            type = 'INFO',
            tenantId,
            unitId,
            entityType,
            entityId,
            metadata = {},
            targetUrl
        } = params;

        const content = body || message || title;

        let notification = null;
        if (userId && tenantId) {
            notification = await prisma.notification.create({
                data: {
                    userId,
                    tenantId,
                    unitId: unitId || null,
                    title,
                    message: content,
                    type,
                    entityType: entityType || null,
                    entityId: entityId || null,
                    targetUrl: targetUrl || null,
                    metadata: metadata ? JSON.stringify(metadata) : null,
                    isRead: false
                }
            });
        }

        emitRealtimeEvent('notification:created', {
            userId,
            tenantId,
            unitId,
            notification
        });

        return notification;
    } catch (err) {
        console.error('Error in sendNotification:', err);
        return null;
    }
};

export const markNotificationRead = async (id, userId) => {
    return prisma.notification.updateMany({
        where: { id, userId },
        data: { isRead: true }
    });
};

export const getMyNotifications = async (userId, tenantId) => {
    return prisma.notification.findMany({
        where: { userId, tenantId },
        orderBy: { createdAt: 'desc' },
        take: 50
    });
};
