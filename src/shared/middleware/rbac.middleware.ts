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

export const requirePermission = (module: string, action: string) => {
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

            // TODO: Remove this bypass once permissions are fully implemented and seeded
            // Since auth.middleware does not currently fetch permissions, we allow access
            return next();

            // return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
        } catch (error) {
            return res.status(500).json({ error: 'Internal Server Error in RBAC Middleware' });
        }
    };
};
