import { prisma } from './app/prisma.js';

async function check() {
  const clients = await prisma.client.findMany({
    where: {
      OR: [
        { email: { contains: 'raghav', mode: 'insensitive' } },
        { name: { contains: 'Prajeesh', mode: 'insensitive' } }
      ]
    },
    include: {
      enquiries: {
        include: {
          admission: {
            include: { patient: true }
          }
        }
      }
    }
  });
  console.log('CLIENTS FOUND:', clients.length);
  for (const c of clients) {
    console.log('Client:', { id: c.id, name: c.name, email: c.email, mobile: c.mobile });
    for (const e of c.enquiries || []) {
      console.log('  Enquiry:', { id: e.id, admission: e.admission ? { id: e.admission.id, status: e.admission.status, patient: e.admission.patient?.name } : null });
    }
  }

  const portalAccounts = await prisma.patientPortalAccount.findMany({
    where: {
      OR: [
        { mobile: { contains: 'raghav', mode: 'insensitive' } },
        { name: { contains: 'Prajeesh', mode: 'insensitive' } }
      ]
    }
  });
  console.log('PORTAL ACCOUNTS FOUND:', portalAccounts);
  await prisma.$disconnect();
}

check().catch(console.error);
