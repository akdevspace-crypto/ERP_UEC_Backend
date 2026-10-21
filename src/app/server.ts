import dotenv from 'dotenv';
dotenv.config(); // Automatically resolves .env from the CWD (Backend dir)

import http from 'http';
// @ts-ignore
import app from './app.js';
import { prisma } from './prisma.js';
import { startPrismaKeepAlive, stopPrismaKeepAlive } from './prismaKeepAlive.js';
import { initSocket } from '../shared/services/socket.js';
import { getOmnichannelRuntimeSettings } from '../config/omnichannel.js';
import { startOutboundWorker, stopOutboundWorker } from '../outbound/worker.runtime.js';
import { startImapWorker, stopImapWorker } from '../modules/webhooks/imapService.js';
import { startCallQueueWorkers } from '../modules/calls/queues.js';
import { startVitalMonitoringScheduler } from '../modules/nursing_care/monitoring.service.js';

const PORT = process.env.PORT || 4000;
const enabled = (value: string | undefined | null, fallback = false) => {
    if (value === undefined || value === null || value === '') return fallback;
    return String(value).trim().toLowerCase() === 'true';
};

const startServer = async () => {
    try {
        const omnichannelEnv = getOmnichannelRuntimeSettings();
        console.log('[AI] Gemini Enabled:', !!process.env.GEMINI_API_KEY);
        await prisma.$connect();
        console.log('[DB] Connected to PostgreSQL successfully');
        startPrismaKeepAlive();
        console.log('[DB] Keep-alive ping scheduled every 30 seconds');
        startVitalMonitoringScheduler();

        const server = http.createServer(app);

        server.listen(PORT, () => {
            console.log(`[API] ERP Backend running on port ${PORT}`);
        });

        // Initialize WebSockets
        try {
            console.log('[SOCKET] Initializing WebSockets...');
            await initSocket(server);
            console.log('[SOCKET] WebSockets initialized');
        } catch (socketError) {
            console.error('[SOCKET] Initialization failed:', socketError);
        }

        if (enabled(process.env.CALL_QUEUE_WORKERS_INLINE, false)) {
            try {
                startCallQueueWorkers();
                console.log('[CALLS] Realtime call queues initialized');
            } catch (queueError) {
                console.error('[CALLS] Realtime call queue initialization failed:', queueError);
            }
        } else {
            console.log('[CALLS] Inline call queue workers disabled.');
        }

        if (omnichannelEnv.OUTBOUND_WORKER_INLINE) {
            console.log('[OUTBOUND] Starting outbound worker...');
            startOutboundWorker().then(() => {
                console.log('[OUTBOUND] Outbound worker ready');
            }).catch(workerError => {
                console.error('[WORKERS] Failed to start outbound worker:', workerError);
            });

            console.log('[INBOUND] Starting IMAP worker...');
            startImapWorker().then(() => {
                console.log('[INBOUND] IMAP worker ready');
            }).catch(workerError => {
                console.error('[WORKERS] Failed to start IMAP worker:', workerError);
            });
        } else {
            console.log('[OUTBOUND] Inline outbound worker disabled. Run `npm run worker:outbound` in production.');
        }

        server.on('error', (err: any) => {
            console.error('SERVER FATAL ERROR:', err);
            process.exit(1);
        });

        server.on('close', async () => {
            stopPrismaKeepAlive();
            await stopOutboundWorker();
            await stopImapWorker();
            console.log('SERVER SOCKET CLOSED.');
        });
    } catch (error: any) {
        if (error?.errorCode === 'P1001') {
            console.error('Database host could not be reached. Verify DATABASE_URL and network connectivity.');
        }
        if (error?.errorCode === 'P1011') {
            console.error('Database TLS failed. If this is local development, set DATABASE_SSL_MODE=disable temporarily.');
        }
        console.error('[SERVER] Failed to start the server', error);
        process.exit(1);
    }
};

process.on("uncaughtException", err => {
   console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", err => {
   console.error("Unhandled Rejection:", err);
});

startServer();
