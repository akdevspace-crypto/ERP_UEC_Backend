import { Request, Response, NextFunction } from 'express';

interface AuthenticatedRequest extends Request {
    user?: any;
}

export const requireRoles = (allowedRoles: string[]) => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        try {
            let rawRole = req.user?.role;
            if (rawRole && typeof rawRole === 'object' && rawRole.name) {
                rawRole = rawRole.name;
            }
            const userRole = String(rawRole || req.user?.roleName || '').trim().toUpperCase().replace(/\s+/g, '_');

            // We do not auto-bypass for SUPER_ADMIN anymore unless explicitly in allowedRoles.
            // If SUPER_ADMIN is meant to have all access, they should have the 'ALL_ACCESS' permission,
            // or we use requirePermissions middleware (to be implemented later).
            // For now, we strictly check against the allowed array.
            
            if (allowedRoles.includes(userRole)) {
                return next();
            }

            // Fallback for permissions if implemented
            const permissions = req.user?.permissions || [];
            if (permissions.includes('ALL_ACCESS')) {
                return next();
            }

            return res.status(403).json({ error: 'Forbidden: Insufficient role permissions' });
        } catch (error) {
            return res.status(500).json({ error: 'Internal Server Error in RBAC Middleware' });
        }
    };
};

export const requirePermission = (module: string, action: string, strict = false) => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        try {
            // Fallback for permissions if implemented
            const permissions = req.user?.permissions || [];
            if (permissions.includes('ALL_ACCESS')) {
                return next();
            }

            const specificPermission = `${module}_${action}`.toUpperCase();
            if (permissions.includes(specificPermission)) {
                return next();
            }

            if (strict) {
                return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
            }

            // Compatibility bypass for legacy routes that have not yet been migrated to
            // explicit permission assignments.
            return next();
        } catch (error) {
            return res.status(500).json({ error: 'Internal Server Error in RBAC Middleware' });
        }
    };
};

export const requireAnyPermission = (allowedPermissions: string[], allowedRoles: string[] = []) => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        try {
            if (!req.user) {
                return res.status(401).json({ success: false, message: 'Unauthorized: Authentication required', error: 'Authentication required' });
            }

            const permissions: string[] = req.user?.permissions || [];
            if (permissions.includes('ALL_ACCESS')) {
                return next();
            }

            const userPermSet = new Set(permissions.map((p: string) => String(p).trim().toUpperCase()));
            const hasPermission = allowedPermissions.some((p: string) => userPermSet.has(p.trim().toUpperCase()));
            if (hasPermission) {
                return next();
            }

            if (allowedRoles && allowedRoles.length > 0) {
                let rawRole = req.user?.role;
                if (rawRole && typeof rawRole === 'object' && rawRole.name) {
                    rawRole = rawRole.name;
                }
                const userRole = String(rawRole || req.user?.roleName || '').trim().toUpperCase().replace(/\s+/g, '_');
                const normalizedRoles = allowedRoles.map((r: string) => r.trim().toUpperCase().replace(/\s+/g, '_'));
                if (normalizedRoles.includes(userRole)) {
                    return next();
                }
            }

            return res.status(403).json({ success: false, message: 'Forbidden: Insufficient permissions', error: 'Forbidden: Insufficient permissions' });
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Internal Server Error in RBAC Middleware', error: 'Internal Server Error in RBAC Middleware' });
        }
    };
};

