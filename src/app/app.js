import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import routes from '../routes/index.js';
import { errorHandler } from '../shared/middleware/error.middleware.js';
import { auditLogger } from '../shared/middleware/audit.middleware.js';
import { ExotelController } from '../modules/exotel/controller.js';
import { TwilioController } from '../modules/twilio/controller.js';

const app = express();

// Global Middlewares
app.use(helmet());

// CORS Configuration
const defaultFrontendOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://localhost:5172',
    'http://127.0.0.1:5172',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://unisenth.onrender.com',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'http://localhost:5175',
    'http://127.0.0.1:5175',
    'http://localhost:5176',
    'http://127.0.0.1:5176',
    'http://localhost:5177',
    'http://127.0.0.1:5177',
    'http://localhost:5178',
    'http://127.0.0.1:5178',
    'http://localhost:5179',
    'http://127.0.0.1:5179',
    'http://localhost:5180',
    'http://127.0.0.1:5180',
    'http://localhost:5181',
    'http://127.0.0.1:5181'
];

const configuredFrontendOrigins = (process.env.FRONTEND_URL || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

const allowedFrontendOrigins = new Set([
    ...defaultFrontendOrigins,
    ...configuredFrontendOrigins
]);

const isAllowedDevTunnelOrigin = (origin) => {
    try {
        const url = new URL(origin);
        return url.protocol === 'https:' && url.hostname.endsWith('.devtunnels.ms');
    } catch {
        return false;
    }
};

const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || allowedFrontendOrigins.has(origin) || isAllowedDevTunnelOrigin(origin)) {
            return callback(null, true);
        }
        return callback(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-unit-id', 'x-inventory-domain']
};
app.use(cors(corsOptions));
app.use(express.json({
    verify: (req, _res, buffer) => {
        if (buffer?.length) {
            req.rawBody = Buffer.from(buffer);
        }
    }
}));
app.use(express.urlencoded({
    extended: true,
    verify: (req, _res, buffer) => {
        if (buffer?.length && !req.rawBody) {
            req.rawBody = Buffer.from(buffer);
        }
    }
}));

app.use('/uploads', express.static('public/uploads'));

// Global Audit Logger
app.use(auditLogger);

// Rate Limiting could be added here

// Public provider webhooks that require provider-owned root paths.
app.post('/webhook/exotel/call', ExotelController.exotelCallWebhook);
app.post('/webhook/twilio/call', TwilioController.callWebhook);

// API Routes
// Keep `/api` for existing frontend clients and expose `/api/v1` for versioned access.
app.use('/api/v1', routes);
app.use('/api', routes);

// Centralized Error Handler
app.use(errorHandler);

export default app;
