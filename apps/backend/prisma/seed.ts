import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { subdomain: 'testco' },
    update: {},
    create: {
      companyName: 'บริษัท เทสต์โก จำกัด',
      subdomain: 'testco',
      subscriptionStatus: 'trial',
    },
  });

  console.log(`Seeded tenant: ${tenant.companyName} (${tenant.subdomain}) — id ${tenant.id}`);
  console.log(`Try: curl -X POST http://localhost:3001/v1/webhook/line/${tenant.id} -H "Content-Type: application/json" -d "{}"`);
  console.log('Try: curl http://localhost:3001/health');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
