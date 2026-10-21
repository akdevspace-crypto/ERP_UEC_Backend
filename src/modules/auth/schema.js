import { z } from 'zod';

export const loginSchema = z.object({
    email: z.string().trim().email(),
    password: z.string().min(6)
});

export const forgotPasswordSchema = z.object({
    email: z.string().trim().email()
});

export const resetPasswordSchema = z.object({
    token: z.string().min(1, 'Token is required'),
    newPassword: z.string()
        .min(8, 'Password must be at least 8 characters long')
        .regex(/[A-Za-z]/, 'Password must contain at least one letter')
        .regex(/[0-9]/, 'Password must contain at least one number')
});

export const changeTemporaryPasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string()
        .min(8, 'Password must be at least 8 characters long')
        .regex(/[A-Za-z]/, 'Password must contain at least one letter')
        .regex(/[0-9]/, 'Password must contain at least one number'),
  confirmPassword: z.string()
}).refine(data => data.newPassword === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"]
});
