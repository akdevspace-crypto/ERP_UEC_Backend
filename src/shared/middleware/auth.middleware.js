import jwt from 'jsonwebtoken';
import { prisma } from '../../app/prisma.js';
import { runWithContext } from '../utils/context.js';
import { canReadFacilityWide } from '../utils/rbac.js';
import { resolveUserAccess } from '../../modules/auth/access.js';

export const auth = async (req, res, next) => { console.log('AUTH HIT:', req.method, req.originalUrl); console.trace('Auth trace');
    try {
        let token;

        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            return res.status(401).json({ success: false, message: 'Not authorized to access this route' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretjwtkeyforerpsystem');

        const user = await prisma.user.findFirst({
            where: {
                id: decoded.id,
                tenantId: decoded.tenantId,
                isDeleted: false
            },
            select: {
                id: true,
                roleId: true,
                tenantId: true,
                unitId: true,
                email: true,
                mobile: true,
                firstName: true,
                lastName: true,
                isActive: true,
                updatedAt: true,
                role: {
                    select: {
                        name: true
                    }
                },
                staff: {
                    select: {
                        id: true,
                        empId: true,
                        department: true,
                        metadata: true
                    }
                }
            }
        });

        if (!user || !user.isActive) {
            return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
        }

        const tokenIssuedAtMs = typeof decoded.iat === 'number' ? decoded.iat * 1000 : 0;
        // if (tokenIssuedAtMs && user.updatedAt.getTime() > tokenIssuedAtMs) {
        //     return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
        // }
        
        // 🚀 Resolve explicit access controls (including StaffMenuPrivilege unit Access)
        const access = resolveUserAccess(user);

        // Mount user info to request
        req.user = {
            id: user.id,
            roleId: user.roleId,
            tenantId: user.tenantId,
            unitId: user.unitId,
            email: user.email,
            mobile: user.mobile,
            name: [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email || user.id,
            role: user.role?.name || decoded.role,
            staff: user.staff || null,
            unitAccess: access.unitAccess || []
        };

        // 🚀 Ensure explicit API layer context
        const headerUnitId = typeof req.headers['x-unit-id'] === 'string'
            ? req.headers['x-unit-id'].trim()
            : Array.isArray(req.headers['x-unit-id'])
                ? String(req.headers['x-unit-id'][0] || '').trim()
                : '';
        
        let activeUnitId = req.user.unitId;
        if (headerUnitId && headerUnitId !== req.user.unitId) {
            const hasExplicitAccess = req.user.unitAccess.includes(headerUnitId);
            const isFacilityWide = req.user.unitAccess.includes('*') || canReadFacilityWide(req.user);
            
            if (hasExplicitAccess || isFacilityWide) {
                // Verify tenant isolation (ensure the requested unit actually belongs to this tenant)
                const requestedUnit = await prisma.unit.findFirst({
                    where: { id: headerUnitId, tenantId: req.user.tenantId },
                    select: { id: true }
                });
                
                if (requestedUnit) {
                    activeUnitId = headerUnitId;
                }
            }
            // If they are not authorized, activeUnitId safely defaults to req.user.unitId
        }

        req.context = {
            tenantId: req.user.tenantId,
            unitId: activeUnitId,
            userId: req.user.id
        };

        if (process.env.DEBUG_REQUEST_CONTEXT === 'true') {
            console.log('CTX:', req.context);
        }

        // 🚀 Rehydrate Context for the request lifecycle
        runWithContext({
            userId: req.user.id,
            tenantId: req.user.tenantId,
            unitId: activeUnitId,
            role: req.user.role
        }, () => {
            next();
        });
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Not authorized to access this route' });
    }
};

export const enforceTenant = (req, res, next) => {
    if (!req.user || !req.user.tenantId || !req.user.unitId) {
        return res.status(403).json({
            success: false,
            message: 'Tenant or Unit isolation violation detected. Access denied.'
        });
    }
    req.tenantId = req.context?.tenantId || req.user.tenantId;
    req.unitId = req.context?.unitId || req.user.unitId;
    req.user.tenantId = req.tenantId;
    
    // Do NOT overwrite req.user.unitId with the activeUnitId globally, keep it as the user's actual base unit
    // but we can expose activeUnitId if needed. req.unitId is the context unitId.

    // 🚀 Prevent tenantId/unitId injection through request payloads
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        if (req.body && typeof req.body === 'object') {
            // Force the authenticated tenantId onto the payload
            req.body.tenantId = req.tenantId;
            
            // Only force unitId if they are not explicitly authorized for the specified unitId
            if (!req.body.unitId) {
                req.body.unitId = req.unitId;
            } else {
                const requestedUnitId = req.body.unitId;
                const hasExplicitAccess = req.user.unitAccess?.includes(requestedUnitId);
                const isFacilityWide = req.user.unitAccess?.includes('*') || canReadFacilityWide(req.user);
                
                if (!hasExplicitAccess && !isFacilityWide) {
                    // Overwrite unauthorized unitId injections safely back to the user's primary base unit
                    req.body.unitId = req.user.unitId;
                }
            }
        }
    }

    next();
};

export const protect = auth; // Alias for backward compatibility

export const authorizeRoles = (...roles) => {
    return (req, res, next) => {
        const userRole = req.user?.role ? String(req.user.role).toUpperCase() : '';
        if (!req.user || !roles.some(role => userRole.includes(role.toUpperCase()))) {
            return res.status(403).json({
                success: false,
                message: `User role is not authorized to access this route`
            });
        }
        next();
    };
};
