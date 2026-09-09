import { PrismaClient } from './src/generated/prisma/index.js';
const prisma = new PrismaClient();

prisma.medicalAssignment.findMany({ 
    orderBy: { createdAt: 'desc' }, 
    take: 1, 
    include: { Staff: true } 
}).then(res => { 
    console.log(JSON.stringify(res, null, 2)); 
    return prisma.$disconnect(); 
}).catch(console.error);
