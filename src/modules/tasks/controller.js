import { createTask, getMyTasks, getTasks, updateTaskStatus } from './service.js';
import { success } from '../../shared/utils/response.js';
import { taskSchema, updateTaskStatusSchema } from './schema.js';
import { emitEvent, EVENTS } from '../event/service.js';

export const handleCreateTask = async (req, res, next) => {
    try {
        const body = { ...req.body };
        if (!body.assigneeId && body.assignedStaffId) {
            body.assigneeId = body.assignedStaffId;
        }
        if (!body.assignedStaffId && body.assigneeId) {
            body.assignedStaffId = body.assigneeId;
        }
        const data = taskSchema.parse(body);
        const tenantId = req.tenantId || req.context?.tenantId || req.user.tenantId;
        const unitId = req.body.unitId || req.headers?.['x-unit-id'] || req.unitId || req.context?.unitId || req.user.unitId;
        const task = await createTask(tenantId, unitId, data);
        emitEvent(EVENTS.TASK_CREATED, { task });
        return success(res, task, { message: 'Task successfully assigned' });
    } catch (error) {
        next(error);
    }
};

export const handleGetTasks = async (req, res, next) => {
    try {
        const filters = {};
        if (req.query.type) filters.type = req.query.type;
        if (req.query.status) filters.status = req.query.status;
        if (req.query.approvalAuthorityId) filters.approvalAuthorityId = req.query.approvalAuthorityId;
        if (req.query.assigneeId) filters.assigneeId = req.query.assigneeId;
        if (req.query.assignedStaffId) filters.assignedStaffId = req.query.assignedStaffId;
        if (req.query.scope === 'approval') filters.approvalQueue = true;
        if (req.query.homeCare === 'true' || req.query.category === 'HOME_CARE') filters.homeCareOnly = true;
        if (req.query.today === 'true' || req.query.todayOnly === 'true') filters.todayOnly = true;

        if (req.query.scope === 'mine') {
            const tasks = await getMyTasks(
                req.tenantId || req.context?.tenantId || req.user.tenantId,
                req.user.id,
                filters
            );
            return success(res, tasks);
        }

        const tasks = await getTasks(
            req.tenantId || req.context?.tenantId || req.user.tenantId,
            req.unitId || req.context?.unitId || req.user.unitId,
            filters
        );
        return success(res, tasks);
    } catch (error) {
        next(error);
    }
};

export const handleUpdateTaskStatus = async (req, res, next) => {
    try {
        const { status, completedAt, remarks } = updateTaskStatusSchema.parse(req.body);
        const task = await updateTaskStatus(
            req.params.id,
            req.tenantId || req.context?.tenantId || req.user.tenantId,
            req.unitId || req.context?.unitId || req.user.unitId,
            status,
            null,
            { completedAt, remarks }
        );
        return success(res, task, { message: 'Task status updated' });
    } catch (error) {
        next(error);
    }
};
