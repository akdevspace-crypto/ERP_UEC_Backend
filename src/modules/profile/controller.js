import { getProfileInfo, updateProfileInfo } from './service.js';
import { success } from '../../shared/utils/response.js';

export const handleGetProfile = async (req, res, next) => {
    try {
        const profile = await getProfileInfo(req.user.id);
        return success(res, profile, { message: 'Profile fetched successfully' });
    } catch (error) {
        next(error);
    }
};

export const handleUpdateProfile = async (req, res, next) => {
    try {
        // Safe allowed fields: phone (mobile)
        const allowedData = {};
        if (req.body.phone !== undefined) {
            allowedData.mobile = req.body.phone;
        }
        
        const profile = await updateProfileInfo(req.user.id, allowedData);
        return success(res, profile, { message: 'Profile updated successfully' });
    } catch (error) {
        next(error);
    }
};
