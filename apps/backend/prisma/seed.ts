import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'Passw0rd!'; // local dev only — never do this in a real environment

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

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const hrAdmin = await prisma.employee.upsert({
    where: { tenantId_employeeCode: { tenantId: tenant.id, employeeCode: 'EMP004' } },
    update: {},
    create: {
      tenantId: tenant.id,
      employeeCode: 'EMP004',
      fullName: 'สุภาวดี ทองอินทร์',
      email: 'hr@testco.local',
      role: 'tenant_admin',
      passwordHash,
      status: 'active',
    },
  });

  const approver = await prisma.employee.upsert({
    where: { tenantId_employeeCode: { tenantId: tenant.id, employeeCode: 'EMP003' } },
    update: {},
    create: {
      tenantId: tenant.id,
      employeeCode: 'EMP003',
      fullName: 'อรรถพล เจริญสุข',
      email: 'approver@testco.local',
      role: 'approver',
      passwordHash,
      status: 'active',
    },
  });

  await prisma.employee.upsert({
    where: { tenantId_employeeCode: { tenantId: tenant.id, employeeCode: 'EMP001' } },
    update: {},
    create: {
      tenantId: tenant.id,
      employeeCode: 'EMP001',
      fullName: 'ธนวัฒน์ ศรีสุข',
      email: 'employee1@testco.local',
      role: 'employee',
      directManagerId: approver.id,
      status: 'active',
    },
  });

  console.log(`Seeded tenant: ${tenant.companyName} (${tenant.subdomain}) — id ${tenant.id}`);
  console.log(`Login as HR Admin: ${hrAdmin.email} / ${DEMO_PASSWORD}`);
  console.log(`Login as Approver: ${approver.email} / ${DEMO_PASSWORD}`);
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
