import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'Passw0rd!'; // local dev only — never do this in a real environment

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { subdomain: 'testco' },
    update: {
      // Fake — not a real LINE channel. Only exists so LineSignatureGuard
      // (NFR-3) has something to verify against in local dev. Real values
      // come from FR-1.2 (Dynamic LINE OA Config), not built yet.
      lineChannelId: 'FAKE_CHANNEL_ID_LOCAL_DEV',
      lineChannelSecretEnc: 'fake-local-dev-channel-secret-not-real',
    },
    create: {
      companyName: 'บริษัท เทสต์โก จำกัด',
      subdomain: 'testco',
      subscriptionStatus: 'trial',
      lineChannelId: 'FAKE_CHANNEL_ID_LOCAL_DEV',
      lineChannelSecretEnc: 'fake-local-dev-channel-secret-not-real',
    },
  });

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const branch = await prisma.branch.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      tenantId: tenant.id,
      branchName: 'สำนักงานใหญ่ กรุงเทพฯ',
      address: '123 ถนนสุขุมวิท กรุงเทพฯ',
      latitude: 13.7563,
      longitude: 100.5018,
      radiusMeters: 50,
    },
  });

  const hrDept = await prisma.department.upsert({
    where: { id: '00000000-0000-0000-0000-000000000011' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000011',
      tenantId: tenant.id,
      branchId: branch.id,
      departmentName: 'ฝ่ายบุคคล',
    },
  });

  const salesDept = await prisma.department.upsert({
    where: { id: '00000000-0000-0000-0000-000000000012' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000012',
      tenantId: tenant.id,
      branchId: branch.id,
      departmentName: 'ฝ่ายขาย',
    },
  });

  const hrAdmin = await prisma.employee.upsert({
    where: { tenantId_employeeCode: { tenantId: tenant.id, employeeCode: 'EMP004' } },
    update: { passwordHash, status: 'active', role: 'tenant_admin' },
    create: {
      tenantId: tenant.id,
      employeeCode: 'EMP004',
      fullName: 'สุภาวดี ทองอินทร์',
      email: 'hr@testco.local',
      role: 'tenant_admin',
      passwordHash,
      status: 'active',
      branchId: branch.id,
      departmentId: hrDept.id,
    },
  });

  const approver = await prisma.employee.upsert({
    where: { tenantId_employeeCode: { tenantId: tenant.id, employeeCode: 'EMP003' } },
    update: { passwordHash, status: 'active', role: 'approver' },
    create: {
      tenantId: tenant.id,
      employeeCode: 'EMP003',
      fullName: 'อรรถพล เจริญสุข',
      email: 'approver@testco.local',
      role: 'approver',
      passwordHash,
      status: 'active',
      branchId: branch.id,
      departmentId: salesDept.id,
    },
  });

  const employee1 = await prisma.employee.upsert({
    where: { tenantId_employeeCode: { tenantId: tenant.id, employeeCode: 'EMP001' } },
    update: { passwordHash, status: 'active', role: 'employee', directManagerId: approver.id },
    create: {
      tenantId: tenant.id,
      employeeCode: 'EMP001',
      fullName: 'ธนวัฒน์ ศรีสุข',
      email: 'employee1@testco.local',
      role: 'employee',
      directManagerId: approver.id,
      status: 'active',
      branchId: branch.id,
      departmentId: salesDept.id,
      passwordHash, // temporary — see auth.service.ts note; real employees use LINE OTP (FR-2.1)
    },
  });

  const leaveTypeSeeds = [
    { id: '00000000-0000-0000-0000-000000000021', name: 'ลาป่วย', defaultQuota: 30, requiresAttachmentAfterDays: 3, allowHourly: true },
    { id: '00000000-0000-0000-0000-000000000022', name: 'ลากิจ', defaultQuota: 3, requiresAttachmentAfterDays: null, allowHourly: true },
    { id: '00000000-0000-0000-0000-000000000023', name: 'ลาพักร้อน', defaultQuota: 6, requiresAttachmentAfterDays: null, allowHourly: false },
  ];
  const leaveTypes = await Promise.all(
    leaveTypeSeeds.map((lt) =>
      prisma.leaveType.upsert({
        where: { id: lt.id },
        update: {},
        create: { ...lt, tenantId: tenant.id },
      }),
    ),
  );

  const year = new Date().getFullYear();
  for (const emp of [hrAdmin, approver, employee1]) {
    for (const lt of leaveTypes) {
      await prisma.leaveQuota.upsert({
        where: { employeeId_leaveTypeId_year: { employeeId: emp.id, leaveTypeId: lt.id, year } },
        update: {},
        create: { tenantId: tenant.id, employeeId: emp.id, leaveTypeId: lt.id, year, totalDays: lt.defaultQuota },
      });
    }
  }

  const defaultWorkflow = await prisma.approvalWorkflow.upsert({
    where: { id: '00000000-0000-0000-0000-000000000031' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000031',
      tenantId: tenant.id,
      name: 'สายอนุมัติมาตรฐาน',
      scopeType: 'global',
    },
  });
  await prisma.approvalWorkflowStep.upsert({
    where: { id: '00000000-0000-0000-0000-000000000032' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000032',
      tenantId: tenant.id,
      workflowId: defaultWorkflow.id,
      stepOrder: 0,
      approverType: 'direct_manager',
    },
  });
  await prisma.approvalWorkflowStep.upsert({
    where: { id: '00000000-0000-0000-0000-000000000033' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000033',
      tenantId: tenant.id,
      workflowId: defaultWorkflow.id,
      stepOrder: 1,
      approverType: 'specific_employee',
      approverEmployeeId: hrAdmin.id,
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
