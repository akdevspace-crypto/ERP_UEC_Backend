import multer from 'multer';
import path from 'path';

// Multer memory storage config for downstream processing (e.g. Supabase)
const storage = multer.memoryStorage();

export const upload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        // Only allow pdf, jpeg, png, docx
        const allowedExtensions = ['.pdf', '.jpeg', '.jpg', '.png', '.docx'];
        const ext = path.extname(file.originalname).toLowerCase();

        if (!allowedExtensions.includes(ext)) {
            return cb(new Error('Invalid file type. Only PDF, JPEG, PNG and DOCX are allowed.'));
        }
        cb(null, true);
    }
});

import { prisma } from '../../app/prisma.js';

export const saveFileMetadata = async ({ fileName, fileUrl, fileType, fileSize, entityType, entityId, category, tenantId, unitId }) => {
    return prisma.fileStorage.create({
        data: {
            fileName,
            fileUrl,
            fileType,
            fileSize,
            entityType,
            entityId,
            category: category || null,
            tenantId,
            unitId
        }
    });
};
