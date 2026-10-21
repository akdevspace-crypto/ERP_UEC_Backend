const entityUnits = [
    { code: 'UNCF', name: 'UNCF', type: 'FOUNDATION' },
    { code: 'UEC', name: 'Universal Elder Care', type: 'ELDER_CARE' },
    { code: 'UHC', name: 'Universal Health Care', type: 'HEALTHCARE' },
    { code: 'UA', name: 'Universal Ambulance', type: 'AMBULANCE' },
    { code: 'UEO', name: 'Universal Enquiry Office', type: 'ENQUIRY' }
];

const names = ['Aarav Sharma', 'Meera Nair', 'Rohan Menon', 'Lakshmi Rao', 'Priya Thomas', 'Karthik Iyer'];
const modes = ['Call', 'Website', 'Walk-in', 'WhatsApp', 'Email'];
const statuses = ['NEW', 'FOLLOW_UP', 'IN_PROGRESS', 'CLOSED'];

const dayOffset = (days) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date;
};

export async function seedEntityData(prisma, tenant, adminUser) {
    const location = await prisma.location.upsert({
        where: {
            name_state_country_pincode: {
                name: 'Coimbatore',
                state: 'Tamil Nadu',
                country: 'India',
                pincode: '641001'
            }
        },
        update: {},
        create: {
            name: 'Coimbatore',
            state: 'Tamil Nadu',
            country: 'India',
            pincode: '641001'
        }
    });

    for (const entity of entityUnits) {
        const unit = await prisma.unit.upsert({
            where: { code: entity.code },
            update: {
                name: entity.name,
                shortName: entity.code,
                unitType: entity.type,
                locationId: location.id,
                tenantId: tenant.id,
                status: true,
                isDeleted: false
            },
            create: {
                name: entity.name,
                code: entity.code,
                shortName: entity.code,
                unitType: entity.type,
                locationId: location.id,
                tenantId: tenant.id,
                status: true
            }
        });

        await prisma.city.upsert({
            where: {
                name_state_country_tenantId_unitId: {
                    name: 'Coimbatore',
                    state: 'Tamil Nadu',
                    country: 'India',
                    tenantId: tenant.id,
                    unitId: unit.id
                }
            },
            update: {
                status: true,
                isDeleted: false,
                deletedAt: null
            },
            create: {
                name: 'Coimbatore',
                state: 'Tamil Nadu',
                country: 'India',
                tenantId: tenant.id,
                unitId: unit.id
            }
        });

        const departments = [
            { code: `${entity.code}-ADMIN`, name: 'Administration', head: [adminUser.firstName, adminUser.lastName].filter(Boolean).join(' ') || 'Admin' },
            { code: `${entity.code}-OPS`, name: 'Operations', head: null },
            { code: `${entity.code}-NURSING`, name: 'Nursing', head: null }
        ];

        for (const department of departments) {
            await prisma.department.upsert({
                where: { code: department.code },
                update: {
                    name: department.name,
                    head: department.head,
                    status: true,
                    isDeleted: false,
                    deletedAt: null,
                    tenantId: tenant.id,
                    unitId: unit.id
                },
                create: {
                    ...department,
                    tenantId: tenant.id,
                    unitId: unit.id
                }
            });
        }

        for (let i = 0; i < 6; i += 1) {
            const client = await prisma.client.upsert({
                where: { refNo: `SEED-${entity.code}-CLI-${i + 1}` },
                update: {},
                create: {
                    refNo: `SEED-${entity.code}-CLI-${i + 1}`,
                    name: names[i],
                    mobile: `98${entity.code.length}${String(i + 1).padStart(7, '0')}`,
                    email: `${names[i].toLowerCase().replace(/[^a-z]+/g, '.')}@${entity.code.toLowerCase()}.demo`,
                    address: `Seed address ${i + 1}, Coimbatore`,
                    tenantId: tenant.id,
                    unitId: unit.id
                }
            });

            const enquiry = await prisma.enquiry.upsert({
                where: { refNo: `SEED-${entity.code}-ENQ-${i + 1}` },
                update: {},
                create: {
                    refNo: `SEED-${entity.code}-ENQ-${i + 1}`,
                    clientId: client.id,
                    mode: modes[i % modes.length],
                    source: entity.code,
                    rawMessage: JSON.stringify({
                        patientName: names[(i + 2) % names.length],
                        patientAge: 62 + i,
                        patientGender: i % 2 === 0 ? 'Male' : 'Female',
                        clientLocation: 'Coimbatore',
                        remarks: `${entity.code} seeded enquiry`
                    }),
                    description: `${entity.name} seeded enquiry ${i + 1}`,
                    status: statuses[i % statuses.length],
                    priority: i % 3 === 0 ? 'HIGH' : 'MEDIUM',
                    isConverted: i % 4 === 3,
                    convertedAt: i % 4 === 3 ? dayOffset(-i) : null,
                    tenantId: tenant.id,
                    unitId: unit.id,
                    createdAt: dayOffset(-i)
                }
            });

            await prisma.followUp.create({
                data: {
                    enquiryId: enquiry.id,
                    notes: `${entity.code} seeded follow-up ${i + 1}`,
                    scheduledAt: dayOffset(i - 2),
                    channel: modes[i % modes.length].toUpperCase(),
                    outcome: i % 2 === 0 ? 'PENDING' : 'INTERESTED',
                    tenantId: tenant.id,
                    unitId: unit.id
                }
            });

            await prisma.automationScore.upsert({
                where: { entityId_module: { entityId: enquiry.id, module: 'enquiry' } },
                update: {},
                create: {
                    entityId: enquiry.id,
                    module: 'enquiry',
                    score: 55 + i * 6,
                    label: i > 3 ? 'HOT' : i > 1 ? 'WARM' : 'COLD',
                    probability: 0.5 + i * 0.05,
                    confidence: 0.75,
                    factors: { seeded: true, entity: entity.code },
                    tenantId: tenant.id,
                    unitId: unit.id
                }
            });
        }

        for (let i = 0; i < 4; i += 1) {
            await prisma.staff.upsert({
                where: { empId: `SEED-${entity.code}-STF-${i + 1}` },
                update: {},
                create: {
                    empId: `SEED-${entity.code}-STF-${i + 1}`,
                    firstName: names[i].split(' ')[0],
                    lastName: names[i].split(' ')[1],
                    designation: i % 2 === 0 ? 'Care Coordinator' : 'Nurse',
                    department: entity.name,
                    phone: `97${entity.code.length}${String(i + 1).padStart(7, '0')}`,
                    email: `staff${i + 1}@${entity.code.toLowerCase()}.demo`,
                    tenantId: tenant.id,
                    unitId: unit.id
                }
            });
        }

        for (let i = 0; i < 5; i += 1) {
            await prisma.accountTransaction.upsert({
                where: { refNo: `SEED-${entity.code}-TXN-${i + 1}` },
                update: {},
                create: {
                    refNo: `SEED-${entity.code}-TXN-${i + 1}`,
                    type: i % 2 === 0 ? 'RECEIPT' : 'EXPENSE',
                    amount: 15000 + i * 3500,
                    paymentMode: 'UPI',
                    category: i % 2 === 0 ? 'Care Fee' : 'Operations',
                    clientName: names[i % names.length],
                    status: i % 2 === 0 ? 'POSTED' : 'PENDING_APPROVAL',
                    notes: i % 2 === 0 ? 'posted seed receipt' : 'pending seed payment',
                    tenantId: tenant.id,
                    unitId: unit.id
                }
            });
        }

        for (let i = 0; i < 3; i += 1) {
            const product = await prisma.product.upsert({
                where: { id: `seed-${entity.code.toLowerCase()}-product-${i + 1}` },
                update: {},
                create: {
                    id: `seed-${entity.code.toLowerCase()}-product-${i + 1}`,
                    name: `${entity.code} Seed Stock ${i + 1}`,
                    category: i === 0 ? 'medical' : 'ration',
                    tenantId: tenant.id,
                    unitId: unit.id
                }
            });

            await prisma.stock.upsert({
                where: {
                    productId_tenantId_unitId: {
                        productId: product.id,
                        tenantId: tenant.id,
                        unitId: unit.id
                    }
                },
                update: { quantity: i === 0 ? 5 : 25 },
                create: {
                    productId: product.id,
                    quantity: i === 0 ? 5 : 25,
                    tenantId: tenant.id,
                    unitId: unit.id
                }
            });
        }

    }
}
