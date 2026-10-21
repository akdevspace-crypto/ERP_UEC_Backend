import rateLimit from 'express-rate-limit';

// Forgot Password Limiter
// 5 requests per hour per IP
export const forgotPasswordLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    message: {
        success: false,
        message: 'Too many password reset requests. Please try again later.'
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Reset Password Limiter
// 10 requests per hour per IP (slightly higher to allow typos)
export const resetPasswordLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,
    message: {
        success: false,
        message: 'Too many password reset attempts. Please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});
