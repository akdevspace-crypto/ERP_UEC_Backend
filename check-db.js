import { prisma } from './src/app/prisma.js';

async function main() {
    const shnStaff = await prisma.staff.findFirst({
        where: { firstName: 'Shanmugapriya' }
    });
    
    const assignments = await prisma.medicalAssignment.findMany({
        where: { staffId: shnStaff.id }
    });
    
    console.log(`Shanmugapriya Assignments: ${assignments.length}`);
    for (const a of assignments) {
        console.log(`- ID: ${a.id}, Created At: ${a.createdAt}`);
    }
}

main().finally(() => prisma.$disconnect());
