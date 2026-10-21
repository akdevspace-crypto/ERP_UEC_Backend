import nodemailer from 'nodemailer';

export const sendEmail = async ({ to, subject, text, html }) => {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.warn(`[Email Service] Email delivery skipped for ${to}. SMTP not fully configured.`);
        return;
    }

    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    try {
        await transporter.sendMail({
            from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
            to,
            subject,
            text,
            html,
        });
    } catch (error) {
        console.error(`[Email Service] Failed to send email to ${to}:`, error.message);
    }
};
