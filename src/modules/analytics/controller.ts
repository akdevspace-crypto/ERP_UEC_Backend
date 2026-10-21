// @ts-ignore
import { success } from "../../shared/utils/response.js";
import { getDashboardKPIs, getOrganizationDashboard } from "./service.js";
// @ts-ignore
import { AIDecisionService } from "../ai/service.js";

const getRequestScope = (req: any) => ({
    tenantId: req.context?.tenantId || req.user.tenantId,
    unitId: req.context?.unitId || req.user.unitId
});

export const handleGetKPIs = async (req: any, res: any, next: any) => {
    try {
        const { tenantId, unitId } = getRequestScope(req);
        const result = await getDashboardKPIs(tenantId, unitId);
        return success(res, result);
    } catch (error) {
        next(error);
    }
};

export const handleGetOrganizationDashboard = async (req: any, res: any, next: any) => {
    try {
        const { tenantId, unitId } = getRequestScope(req);
        const result = await getOrganizationDashboard(tenantId, unitId, req.params.orgCode);
        return success(res, result);
    } catch (error) {
        next(error);
    }
};

export const handleAnalyticsForecast = async (req: any, res: any, next: any) => {
    try {
        const { tenantId, unitId } = getRequestScope(req);
        const result = await AIDecisionService.buildForecast({
            tenantId,
            unitId,
            userId: req.user.id
        }, req.body || req.query || {});

        return success(res, result);
    } catch (error) {
        next(error);
    }
};

export const handleGetActivities = async (req: any, res: any, next: any) => {
    try {
        const { tenantId, unitId } = getRequestScope(req);
        // @ts-ignore
        const { getGlobalActivities } = await import("./service.js");
        const result = await getGlobalActivities(tenantId, unitId);
        return success(res, result);
    } catch (error) {
        next(error);
    }
};
