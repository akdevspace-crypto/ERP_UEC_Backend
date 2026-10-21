import { prisma } from '../../app/prisma.js';
import crypto from 'crypto';

export interface CreateVolunteerInput {
    name: string;
    mobile?: string;
    email?: string;
    role: string;
    initiative?: string;
    availability?: string;
    status?: 'ACTIVE' | 'INACTIVE';
    joinedDate?: string | Date;
}

export interface VolunteerItem {
    id: string;
    name: string;
    mobile?: string;
    email?: string;
    role: string;
    initiative?: string;
    availability: string;
    status: 'ACTIVE' | 'INACTIVE';
    joinedDate: string;
    tenantId: string;
    unitId?: string | null;
    createdAt: string;
}

export class VolunteerService {
    async getVolunteers(scope: { tenantId: string; unitId?: string | null }): Promise<VolunteerItem[]> {
        const { tenantId, unitId } = scope;
        if (!tenantId) {
            throw new Error('Tenant context is required');
        }

        let rows: any[] = [];
        if (unitId && unitId !== 'ALL' && unitId !== 'ALL_UNITS') {
            rows = await (prisma as any).$queryRaw`
                SELECT 
                    "id", "name", "mobile", "email", "role", "initiative", 
                    "availability", "status", "joinedDate", "tenantId", "unitId", 
                    "createdAt", "updatedAt"
                FROM "Volunteer"
                WHERE "tenantId" = ${tenantId} 
                  AND "isDeleted" = false
                  AND ("unitId" = ${unitId} OR "unitId" IS NULL)
                ORDER BY "createdAt" DESC;
            `;
        } else {
            rows = await (prisma as any).$queryRaw`
                SELECT 
                    "id", "name", "mobile", "email", "role", "initiative", 
                    "availability", "status", "joinedDate", "tenantId", "unitId", 
                    "createdAt", "updatedAt"
                FROM "Volunteer"
                WHERE "tenantId" = ${tenantId} 
                  AND "isDeleted" = false
                ORDER BY "createdAt" DESC;
            `;
        }

        return rows.map(r => ({
            id: r.id,
            name: r.name,
            mobile: r.mobile || '—',
            email: r.email || undefined,
            role: r.role,
            initiative: r.initiative || 'Community Support',
            availability: r.availability || 'Part Time',
            status: (r.status as 'ACTIVE' | 'INACTIVE') || 'ACTIVE',
            joinedDate: r.joinedDate ? new Date(r.joinedDate).toISOString() : new Date().toISOString(),
            tenantId: r.tenantId,
            unitId: r.unitId,
            createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString()
        }));
    }

    async createVolunteer(
        scope: { tenantId: string; unitId?: string | null; user?: any },
        data: CreateVolunteerInput
    ): Promise<VolunteerItem> {
        const { tenantId, unitId } = scope;
        if (!tenantId) {
            throw new Error('Tenant context is required');
        }

        if (!data.name || !data.name.trim()) {
            throw new Error('Volunteer name is required');
        }
        if (!data.role || !data.role.trim()) {
            throw new Error('Volunteer role is required');
        }

        const id = 'vol-' + crypto.randomUUID();
        const availability = data.availability || 'Part Time';
        const status = data.status || 'ACTIVE';
        const joinedDate = data.joinedDate ? new Date(data.joinedDate) : new Date();
        const targetUnitId = unitId && unitId !== 'ALL' && unitId !== 'ALL_UNITS' ? unitId : null;

        await (prisma as any).$executeRaw`
            INSERT INTO "Volunteer" (
                "id", "name", "mobile", "email", "role", "initiative", 
                "availability", "status", "joinedDate", "tenantId", "unitId", 
                "createdAt", "updatedAt"
            ) VALUES (
                ${id},
                ${data.name.trim()},
                ${data.mobile?.trim() || null},
                ${data.email?.trim() || null},
                ${data.role.trim()},
                ${data.initiative?.trim() || null},
                ${availability},
                ${status},
                ${joinedDate},
                ${tenantId},
                ${targetUnitId},
                NOW(),
                NOW()
            );
        `;

        return {
            id,
            name: data.name.trim(),
            mobile: data.mobile?.trim() || '—',
            email: data.email?.trim() || undefined,
            role: data.role.trim(),
            initiative: data.initiative?.trim() || 'Community Support',
            availability,
            status: status as 'ACTIVE' | 'INACTIVE',
            joinedDate: joinedDate.toISOString(),
            tenantId,
            unitId: targetUnitId,
            createdAt: new Date().toISOString()
        };
    }
}

export const volunteerService = new VolunteerService();
