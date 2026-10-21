import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function seed() {
    console.log("Seeding Roles and Permissions...");

    const tenantId = "test-tenant-id"; // We should find an existing tenant or default
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) {
        console.log("No tenant found. Cannot seed roles.");
        return;
    }
    
    const roles = [
        { name: "SUPER_ADMIN", description: "Global Administrator" },
        { name: "ADMINISTRATIVE", description: "General facility administration" },
        { name: "FRONTDESK", description: "Front desk and reception operations" },
        { name: "PATIENT_CARE_STAFF", description: "Patient care staff" },
        { name: "PATIENT_CARE_MANAGER", description: "Manager of Patient Care" },
        { name: "NURSING_CARE_STAFF", description: "Nursing care staff" },
        { name: "NURSING_MANAGER", description: "Manager of Nursing Care" },
        { name: "MEDICAL_DOCTOR", description: "Clinical Medical Doctor" },
        { name: "MEDICAL_MANAGER", description: "Manager of Medical Staff" },
        { name: "INVENTORY_MEDICAL", description: "Medical Inventory Manager" },
        { name: "INVENTORY_FOOD", description: "Food Inventory Manager" },
        { name: "FINANCE_STAFF", description: "Finance operations" },
        { name: "FINANCE_MANAGER", description: "Finance Manager" },
        { name: "HR_STAFF", description: "HR operations" },
        { name: "HR_MANAGER", description: "HR Manager" },
        { name: "CRM_STAFF", description: "CRM / Enquiry staff" },
        { name: "CRM_MANAGER", description: "CRM / Enquiry Manager" },
        { name: "OPERATIONS_STAFF", description: "Daily operations staff" },
        { name: "OPERATIONS_MANAGER", description: "Operations Manager" },
        { name: "SECURITY_STAFF", description: "Facility security" },
        { name: "HOME_CARE_MANAGER", description: "Manager of Home Care Operations" }
    ];

    for (const roleData of roles) {
        const role = await prisma.role.upsert({
            where: { name_tenantId: { name: roleData.name, tenantId: tenant.id } },
            update: {},
            create: {
                name: roleData.name,
                description: roleData.description,
                tenantId: tenant.id
            }
        });
        console.log(`Role upserted: ${role.name}`);
    }

    console.log("Role seeding complete.");
}

seed()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
