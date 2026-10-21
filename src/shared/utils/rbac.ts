export const canReadFacilityWide = (user: any): boolean => {
    if (!user) return false;

    // Existing legitimate facility-wide authorization logic from original canReadAllUnits implementations
    const existingFacilityWideAllowed = Boolean(
        user?.unitAccess?.includes('*') ||
        user?.permissions?.includes('ALL_ACCESS')
    );

    if (existingFacilityWideAllowed) {
        return true;
    }

    const roleName = String(user?.role?.name || user?.role || user?.roleName || '').trim().toLowerCase();

    // Specific inclusion of modern manager roles
    // Note: Per ERP authorization policy, Inventory managers require explicit authorized-unit grants
    // and must never gain cross-unit or facility-wide access solely from role names.
    const managerRoles = [
        'nursing_manager',
        'patient_care_manager',
        'finance manager',
        // Legacy roles that originally had this access
        'admin',
        'super admin',
        'super_admin',
        'superadmin',
        'in-house care manager',
        'healthcare manager'
    ];

    return managerRoles.includes(roleName);
};

export const getReadScope = (req: any) => {
    if (!req.user || !req.user.tenantId) {
        throw new Error("getReadScope: tenantId is strictly required but was not found on req.user");
    }

    const explicitAllUnits =
        String(req.query?.unitScope || '').trim().toLowerCase() === 'all' ||
        String(req.query?.allUnits || '').trim().toLowerCase() === 'true';

    // Disallow inventory category scope=all from bypassing unit isolation
    const isInventoryRequest = Boolean(
        req.baseUrl?.includes('inventory') ||
        req.baseUrl?.includes('product') ||
        req.baseUrl?.includes('stock') ||
        req.path?.includes('product') ||
        req.path?.includes('stock')
    );

    const legacyScopeAllUnits = !isInventoryRequest && String(req.query?.scope || '').trim().toLowerCase() === 'all';

    // Per approved authorization policy, inventory facility-wide access strictly requires
    // an explicit unitAccess grant ('*'). ALL_ACCESS alone does not grant inventory facility-wide reads.
    const hasInventoryExplicitAllUnits = Boolean(
        Array.isArray(req.user?.unitAccess) && req.user.unitAccess.includes('*')
    );

    const canReadAll = isInventoryRequest ? hasInventoryExplicitAllUnits : canReadFacilityWide(req.user);
    const includeAllUnits = (explicitAllUnits || legacyScopeAllUnits) && canReadAll;
    
    return {
        tenantId: req.user.tenantId,
        ...(includeAllUnits ? {} : { unitId: req.context?.unitId || req.user.unitId })
    };
};
