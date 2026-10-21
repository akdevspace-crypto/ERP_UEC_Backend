import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    console.log('--- STARTING STANDALONE LOGIN RECOVERY SEED ---');

    // 1. Get Tenant
    const tenant = await prisma.tenant.findUnique({ where: { code: 'DEFAULT_TENANT' } });
    if (!tenant) throw new Error('Missing Tenant: DEFAULT_TENANT');

    // 2. Get Units
    const unitCodes = ['UNCF', 'UEC', 'UEO', 'UHC'];
    const units = {};
    for (const code of unitCodes) {
        const unit = await prisma.unit.findUnique({ where: { code } });
        if (!unit) throw new Error(`Missing Unit: ${code}`);
        units[code] = unit;
    }

    // 3. Get Roles
    const roleNames = ['Admin', 'HR_MANAGER', 'FINANCE_MANAGER', 'NURSING_MANAGER', 'HOME_CARE_MANAGER'];
    const roles = {};
    for (const name of roleNames) {
        const role = await prisma.role.findUnique({
            where: {
                name_tenantId: { name, tenantId: tenant.id }
            }
        });
        if (!role) {
            console.error(`ERROR: Missing required role "${name}". Please ensure seed_roles.js and main seed.js have executed successfully.`);
            process.exit(1);
        }
        roles[name] = role;
    }

    // 4. Hash password
    const recoveryPassword = 'ERPRecovery@2026!';
    const passwordHash = await bcrypt.hash(recoveryPassword, 10);

    // 5. Upsert Users
    const usersToCreate = [
        {
            email: 'admin@example.com',
            firstName: 'Visitor',
            lastName: 'Manager',
            roleName: 'Admin',
            unitCode: 'UNCF'
        },
        {
            email: 'uncf.hr@unisenth.local',
            firstName: 'HR',
            lastName: 'Manager',
            roleName: 'HR_MANAGER',
            unitCode: 'UNCF'
        },
        {
            email: 'finance.manager@erp.local',
            firstName: 'Finance',
            lastName: 'Manager',
            roleName: 'FINANCE_MANAGER',
            unitCode: 'UEC'
        },
        {
            email: 'user@uec.com',
            firstName: 'CRM',
            lastName: 'Manager',
            roleName: 'Admin',
            unitCode: 'UEO'
        },
        {
            email: 'Raghav@uec.com',
            firstName: 'Raghav',
            lastName: 'Donations',
            roleName: 'Admin',
            unitCode: 'UNCF'
        },
        {
            email: 'nursing.manager@unisenth.local',
            firstName: 'Nursing',
            lastName: 'Manager',
            roleName: 'NURSING_MANAGER',
            unitCode: 'UEC'
        },
        {
            email: 'homecare.manager@unisenth.local',
            firstName: 'Home Care',
            lastName: 'Manager',
            roleName: 'HOME_CARE_MANAGER',
            unitCode: 'UHC'
        }
    ];

    for (const userData of usersToCreate) {
        console.log(`Upserting user: ${userData.email} (${userData.roleName})`);
        await prisma.user.upsert({
            where: { email: userData.email },
            update: {
                passwordHash,
                firstName: userData.firstName,
                lastName: userData.lastName,
                roleId: roles[userData.roleName].id,
                tenantId: tenant.id,
                unitId: units[userData.unitCode].id,
                isActive: true,
                isDeleted: false
            },
            create: {
                email: userData.email,
                passwordHash,
                firstName: userData.firstName,
                lastName: userData.lastName,
                roleId: roles[userData.roleName].id,
                tenantId: tenant.id,
                unitId: units[userData.unitCode].id,
                isActive: true,
                isDeleted: false
            }
        });
    }

    console.log('--- RECOVERY ACCOUNTS SEEDED SUCCESSFULLY ---');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
