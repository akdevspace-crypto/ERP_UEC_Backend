import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/index.js';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    console.log('Seeding Billing Manager user...');

    // 1. Get the Default Tenant and Unit
    const tenant = await prisma.tenant.findUnique({ where: { code: 'DEFAULT_TENANT' } });
    if (!tenant) throw new Error('DEFAULT_TENANT not found. Have you run the main seed script?');
    
    const unit = await prisma.unit.findUnique({ where: { code: 'HQ_UNIT' } });
    if (!unit) throw new Error('HQ_UNIT not found. Have you run the main seed script?');

    // 2. Create Elder Finance Manager Role
    const financeRole = await prisma.role.upsert({
        where: { name_tenantId: { name: 'Elder Finance Manager', tenantId: tenant.id } },
        update: {},
        create: {
            name: 'Elder Finance Manager',
            description: 'Manager of Finance and Billing for UEC',
            tenantId: tenant.id
        }
    });

    // 3. Hash Password
    const passwordHash = await bcrypt.hash('finance123', 10);

    // 4. Create User
    const financeUser = await prisma.user.upsert({
        where: { email: 'uec.finance@demo.erp' },
        update: {
            passwordHash,
            firstName: 'Elder Finance',
            lastName: 'Manager',
            roleId: financeRole.id,
            tenantId: tenant.id,
            unitId: unit.id,
            isDeleted: false,
            isActive: true
        },
        create: {
            email: 'uec.finance@demo.erp',
            passwordHash,
            firstName: 'Elder Finance',
            lastName: 'Manager',
            roleId: financeRole.id,
            tenantId: tenant.id,
            unitId: unit.id,
            isDeleted: false,
            isActive: true
        }
    });

    console.log('✅ Billing Manager user created successfully!');
    console.log(`Email: ${financeUser.email}`);
    console.log(`Password: finance123`);
    console.log(`Role: ${financeRole.name}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
