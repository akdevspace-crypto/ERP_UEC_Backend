import 'dotenv/config';
import jwt from 'jsonwebtoken';
import fetch from 'node-fetch';
import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

async function main() {
    const user = await prisma.user.findUnique({
        where: { email: 'uec.finance@demo.erp' },
        include: { role: true }
    });

    const token = jwt.sign(
        { id: user.id, tenantId: user.tenantId, role: user.role?.name || '' },
        process.env.JWT_SECRET || 'supersecretjwtkeyforerpsystem',
        { expiresIn: '1d' }
    );

    // Set a very new iat for the token, manually modifying it
    const decoded = jwt.decode(token);
    const newToken = jwt.sign(
        { id: user.id, tenantId: user.tenantId, role: user.role?.name || '', iat: Math.floor(Date.now() / 1000) + 10 },
        process.env.JWT_SECRET || 'supersecretjwtkeyforerpsystem',
        { expiresIn: '1d' }
    );

    console.log('Sending request to https://erp-uec-backend.onrender.com/api/patient-billing/entries?scope=all');
    console.log('Token:', newToken.substring(0, 20) + '...');

    const response = await fetch('https://erp-uec-backend.onrender.com/api/patient-billing/entries?scope=all', {
        headers: {
            'Authorization': `Bearer ${newToken}`,
            'x-unit-id': user.unitId // Simulate frontend sending current unit
        }
    });

    const body = await response.json();
    console.log(`Status: ${response.status}`);
    console.log(`Entries count:`, body.data ? body.data.length : body.message);
    if (body.data && body.data.length > 0) {
        console.log(`First entry:`, body.data[0].patientName, body.data[0].amount);
    }
}

main().finally(() => prisma.$disconnect());
