export type InventoryScope = 'all' | 'elder' | 'medical' | 'food';

export const VALID_INVENTORY_SCOPES: readonly InventoryScope[] = ['all', 'elder', 'medical', 'food'] as const;

const INVENTORY_SCOPE_ALIASES = new Set(['all', 'elder', 'medical', 'food', 'ration', 'food_ration']);

export const isValidInventoryScope = (scope: unknown): boolean => (
    typeof scope === 'string' && INVENTORY_SCOPE_ALIASES.has(scope.trim().toLowerCase())
);

export const validateInventoryScope = (req: any, res: any, next: () => void) => {
    // Only intercept requests destined for inventory endpoints or carrying an explicit inventory domain header
    const rawPath = String(req.originalUrl || req.url || req.path || '').toLowerCase();
    const isInventoryEndpoint =
        rawPath.includes('/product') ||
        rawPath.includes('/stock') ||
        rawPath.includes('/inventory') ||
        rawPath.includes('/goods-receipt') ||
        rawPath.includes('/purchase-order') ||
        rawPath.includes('/supplier-return') ||
        rawPath.includes('/physical-audit') ||
        rawPath.includes('/valuation') ||
        rawPath.includes('/consumption');

    const hasExplicitInventoryHeader = Boolean(req.headers['x-inventory-domain'] || req.query.inventoryScope);

    if (!isInventoryEndpoint && !hasExplicitInventoryHeader) {
        return next();
    }

    const requestedScope = req.headers['x-inventory-domain']
        ?? req.query.domain
        ?? req.query.inventoryScope
        ?? req.query.scope;

    if (requestedScope === undefined || requestedScope === null || requestedScope === '') {
        return next();
    }

    if (!isValidInventoryScope(requestedScope)) {
        return res.status(400).json({ success: false, message: 'Invalid inventory category scope' });
    }

    next();
};

export const resolveInventoryReportUnitId = (requestedUnitId: unknown, scope: any): string | undefined => {
    const buildError = (message: string, status: number) => {
        const error: any = new Error(message);
        error.status = status;
        return error;
    };

    if (!scope?.tenantId) {
        throw buildError('Tenant context is required', 403);
    }

    if (requestedUnitId === undefined || requestedUnitId === null) {
        return scope.unitId;
    }

    if (typeof requestedUnitId !== 'string' || !requestedUnitId.trim()) {
        throw buildError('Invalid Inventory unit identifier', 400);
    }

    const unitId = requestedUnitId.trim();
    if (unitId.toLowerCase() === 'all') {
        if (scope.unitId) {
            throw buildError('Access denied to requested Inventory unit', 403);
        }
        return undefined;
    }

    if (!scope.unitId || unitId !== scope.unitId) {
        throw buildError('Access denied to requested Inventory unit', 403);
    }

    return scope.unitId;
};

export const getInventoryReportScope = (req: any) => {
    const buildError = (message: string, status: number) => {
        const error: any = new Error(message);
        error.status = status;
        return error;
    };

    if (!req.user || !req.user.tenantId) {
        throw buildError('Tenant context is required', 403);
    }

    const rawHeaderUnitId = req.headers?.['x-unit-id'] || req.headers?.['X-Unit-Id'];
    const headerUnitId = typeof rawHeaderUnitId === 'string'
        ? rawHeaderUnitId.trim()
        : Array.isArray(rawHeaderUnitId)
            ? String(rawHeaderUnitId[0] || '').trim()
            : '';

    // Per approved authorization policy, cross-unit and facility-wide Inventory access requires
    // an explicit authorized-unit grant (unitAccess: ['*']). ALL_ACCESS alone does not prove
    // explicit unit authorization.
    const hasExplicitAllUnitGrant = Boolean(
        Array.isArray(req.user?.unitAccess) && req.user.unitAccess.includes('*')
    );

    if (headerUnitId && headerUnitId !== req.user?.unitId) {
        const hasExplicitUnitAccess = Array.isArray(req.user?.unitAccess) && req.user.unitAccess.includes(headerUnitId);
        if (!hasExplicitUnitAccess && !hasExplicitAllUnitGrant) {
            throw buildError('Access denied to requested Inventory unit', 403);
        }

        if (req.context?.unitId && req.context.unitId !== headerUnitId) {
            throw buildError('Access denied to requested Inventory unit', 403);
        }
    }

    const isAllUnitsRequested =
        String(req.query?.allUnits || '').trim().toLowerCase() === 'true' ||
        String(req.query?.unitScope || '').trim().toLowerCase() === 'all' ||
        String(req.query?.unitId || '').trim().toLowerCase() === 'all' ||
        String(req.headers?.['x-unit-scope'] || '').trim().toLowerCase() === 'all';

    if (isAllUnitsRequested) {
        if (!hasExplicitAllUnitGrant) {
            throw buildError('Access denied to requested Inventory unit', 403);
        }
        return {
            tenantId: req.user.tenantId
        };
    }

    const hasExplicitUnitAccessForHeader = headerUnitId && (
        (Array.isArray(req.user?.unitAccess) && req.user.unitAccess.includes(headerUnitId)) ||
        hasExplicitAllUnitGrant
    );

    const activeUnitId = req.context?.unitId || (hasExplicitUnitAccessForHeader ? headerUnitId : req.user.unitId);
    if (!activeUnitId) {
        throw buildError('Unit context is required', 403);
    }

    return {
        tenantId: req.user.tenantId,
        unitId: activeUnitId
    };
};

export const medicalCategories = new Set([
    'medical',
    'medicine',
    'medicines',
    'clinical',
    'clinical-consumables'
]);

export const foodRationCategories = new Set([
    'ration',
    'fresh food',
    'food',
    'food & ration',
    'ration & kitchen'
]);

// Ambiguous or general facility categories that must NOT be silently classified as medical or food/ration
export const generalFacilityCategories = new Set([
    'stationary',
    'electrical',
    'plumbing',
    'electrical-plumbing',
    'assets',
    'asset',
    'kitchen',
    'general'
]);

// Backward-compatibility alias
export const elderCategories = foodRationCategories;

export const normalizeInventoryCategory = (category?: string | null): string =>
    String(category || '').trim().toLowerCase();

export const normalizeInventoryScope = (scope?: string | null): InventoryScope => {
    const raw = String(scope || '').trim().toLowerCase();
    if (!raw || raw === 'all') return 'all';
    if (raw === 'medical') return 'medical';
    if (raw === 'elder' || raw === 'food' || raw === 'ration' || raw === 'food_ration') return 'food';
    throw new Error('Invalid inventory category scope');
};

export const isCategoryInScope = (category: string | null | undefined, scope: InventoryScope | string): boolean => {
    const normalizedScope = normalizeInventoryScope(scope);
    if (normalizedScope === 'all') return true;
    const normalizedCategory = normalizeInventoryCategory(category);
    if (normalizedScope === 'medical') {
        return medicalCategories.has(normalizedCategory);
    }
    if (normalizedScope === 'food' || (normalizedScope as string) === 'elder') {
        // Strictly verified Food & Ration categories; no loose fallback
        return foodRationCategories.has(normalizedCategory);
    }
    return true;
};

export const isAmbiguousCategory = (category: string | null | undefined): boolean => {
    const normalized = normalizeInventoryCategory(category);
    return !medicalCategories.has(normalized) && !foodRationCategories.has(normalized);
};

export const getCategoryDomain = (category: string | null | undefined): 'medical' | 'food' | 'ambiguous' => {
    const normalized = normalizeInventoryCategory(category);
    if (medicalCategories.has(normalized)) return 'medical';
    if (foodRationCategories.has(normalized)) return 'food';
    return 'ambiguous';
};

export const filterProductsByScope = (products: any[], scopeName?: string): any[] => {
    if (!Array.isArray(products)) return [];
    if (!scopeName) return products;
    const normalizedScope = normalizeInventoryScope(scopeName);
    if (normalizedScope === 'all') return products;

    return products.filter((p) => isCategoryInScope(p?.category, normalizedScope));
};
