import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { tenantScopingExtension } from '../src/tenant/tenant-scoping.extension';
import { tenantContext } from '../src/tenant/tenant-context';

/**
 * NFR-1 (Strict Data Isolation), asserted against a real database.
 *
 * This is the one guarantee that must not have a hole in it once more than
 * one customer is on the platform: a single leaked row here is a breach, not
 * a bug. Unit tests with a mocked Prisma can only prove the extension was
 * *called*; they cannot prove the resulting SQL actually filters. So these
 * run the genuine client, against the genuine schema, and assert on what
 * comes back.
 *
 * Requires DATABASE_URL (loaded from apps/backend/.env by the run script).
 * Everything it creates is namespaced by a random run id and torn down
 * afterwards, so it is safe to point at a development database.
 */
const RUN = randomUUID().slice(0, 8);

const prisma = new PrismaClient();
const scoped = prisma.$extends(tenantScopingExtension);

/**
 * Runs `fn` as if an HTTP request for this tenant were in flight (see
 * TenantMiddleware).
 *
 * The `await` is load-bearing: a Prisma call returns a *lazy* PrismaPromise
 * that doesn't execute — and so doesn't run the scoping extension — until
 * something subscribes to it. Handing that unawaited promise back out of
 * `tenantContext.run` would leave the extension to run later, after the
 * AsyncLocalStorage scope had already exited, and every query would fail with
 * "No tenant context available". Awaiting here subscribes while the scope is
 * still open. (Nothing in the app hits this: TenantMiddleware wraps `next()`,
 * so the whole request — handler and response — resolves inside the scope.)
 */
function asTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return tenantContext.run({ tenantId }, async () => await fn());
}

describe('Tenant isolation (NFR-1)', () => {
  let tenantA: string;
  let tenantB: string;
  let employeeA: string;
  let employeeB: string;
  let leaveTypeA: string;
  let attachmentA: string;

  beforeAll(async () => {
    const [a, b] = await Promise.all([
      prisma.tenant.create({ data: { companyName: `A-${RUN}`, subdomain: `a-${RUN}` } }),
      prisma.tenant.create({ data: { companyName: `B-${RUN}`, subdomain: `b-${RUN}` } }),
    ]);
    tenantA = a.id;
    tenantB = b.id;

    const [ea, eb] = await Promise.all([
      prisma.employee.create({
        data: { tenantId: tenantA, employeeCode: `EMP-A-${RUN}`, fullName: 'Ann A', email: `ann-${RUN}@a.example`, role: 'employee' },
      }),
      prisma.employee.create({
        data: { tenantId: tenantB, employeeCode: `EMP-B-${RUN}`, fullName: 'Ben B', email: `ben-${RUN}@b.example`, role: 'tenant_admin' },
      }),
    ]);
    employeeA = ea.id;
    employeeB = eb.id;

    const lt = await prisma.leaveType.create({ data: { tenantId: tenantA, name: `Sick-${RUN}`, defaultQuota: 30 } });
    leaveTypeA = lt.id;

    const attachment = await prisma.leaveAttachment.create({
      data: {
        tenantId: tenantA,
        uploadedByEmployeeId: employeeA,
        storageKey: `${tenantA}/${RUN}.pdf`,
        originalFilename: 'cert.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10,
      },
    });
    attachmentA = attachment.id;
  });

  afterAll(async () => {
    // Cascades clear employees / leave types / attachments with the tenant.
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
    await prisma.$disconnect();
  });

  describe('reads', () => {
    it('findMany returns only the current tenant\'s rows', async () => {
      const seenByB = await asTenant(tenantB, () => scoped.employee.findMany());
      expect(seenByB.map((e) => e.id)).toEqual([employeeB]);
      expect(seenByB.map((e) => e.id)).not.toContain(employeeA);
    });

    // The dangerous case: B holds a valid id belonging to A (from a log, a
    // guessed URL, a copy-pasted link) and asks for it directly.
    it('findFirst by another tenant\'s id returns null', async () => {
      await expect(asTenant(tenantB, () => scoped.employee.findFirst({ where: { id: employeeA } }))).resolves.toBeNull();
    });

    it('findUnique by another tenant\'s id returns null', async () => {
      await expect(asTenant(tenantB, () => scoped.employee.findUnique({ where: { id: employeeA } }))).resolves.toBeNull();
    });

    it('findUniqueOrThrow on another tenant\'s id throws rather than returning the row', async () => {
      await expect(asTenant(tenantB, () => scoped.employee.findUniqueOrThrow({ where: { id: employeeA } }))).rejects.toBeDefined();
    });

    it('count excludes other tenants', async () => {
      await expect(asTenant(tenantB, () => scoped.employee.count())).resolves.toBe(1);
    });

    it('a leave attachment is invisible to another tenant', async () => {
      await expect(asTenant(tenantB, () => scoped.leaveAttachment.findFirst({ where: { id: attachmentA } }))).resolves.toBeNull();
      await expect(asTenant(tenantA, () => scoped.leaveAttachment.findFirst({ where: { id: attachmentA } }))).resolves.not.toBeNull();
    });

    it('a leave type is invisible to another tenant', async () => {
      await expect(asTenant(tenantB, () => scoped.leaveType.findFirst({ where: { id: leaveTypeA } }))).resolves.toBeNull();
    });
  });

  describe('writes', () => {
    it('update against another tenant\'s row changes nothing', async () => {
      await expect(
        asTenant(tenantB, () => scoped.employee.update({ where: { id: employeeA }, data: { fullName: 'HACKED' } })),
      ).rejects.toBeDefined();

      const untouched = await prisma.employee.findUniqueOrThrow({ where: { id: employeeA } });
      expect(untouched.fullName).toBe('Ann A');
    });

    it('updateMany cannot reach across tenants', async () => {
      const result = await asTenant(tenantB, () => scoped.employee.updateMany({ where: { id: employeeA }, data: { fullName: 'HACKED' } }));
      expect(result.count).toBe(0);

      const untouched = await prisma.employee.findUniqueOrThrow({ where: { id: employeeA } });
      expect(untouched.fullName).toBe('Ann A');
    });

    it('deleteMany cannot reach across tenants', async () => {
      const result = await asTenant(tenantB, () => scoped.leaveAttachment.deleteMany({ where: { id: attachmentA } }));
      expect(result.count).toBe(0);
      await expect(prisma.leaveAttachment.findUnique({ where: { id: attachmentA } })).resolves.not.toBeNull();
    });

    // A create that names someone else's tenant must not be honoured — the
    // extension overwrites tenantId rather than trusting the caller.
    it('create stamps the ambient tenant even when another tenantId is passed in', async () => {
      const created = await asTenant(tenantB, () =>
        scoped.leaveType.create({ data: { tenantId: tenantA, name: `Injected-${RUN}`, defaultQuota: 1 } }),
      );
      expect(created.tenantId).toBe(tenantB);

      await prisma.leaveType.delete({ where: { id: created.id } });
    });

    it('createMany stamps the ambient tenant on every row', async () => {
      await asTenant(tenantB, () =>
        scoped.leaveType.createMany({
          data: [
            { tenantId: tenantA, name: `Bulk1-${RUN}`, defaultQuota: 1 },
            { tenantId: tenantA, name: `Bulk2-${RUN}`, defaultQuota: 1 },
          ],
        }),
      );

      const leakedIntoA = await prisma.leaveType.count({ where: { tenantId: tenantA, name: { startsWith: `Bulk` } } });
      const landedInB = await prisma.leaveType.count({ where: { tenantId: tenantB, name: { startsWith: `Bulk` } } });
      expect(leakedIntoA).toBe(0);
      expect(landedInB).toBe(2);

      await prisma.leaveType.deleteMany({ where: { tenantId: tenantB, name: { startsWith: 'Bulk' } } });
    });
  });

  describe('the guarantee itself', () => {
    // A model added to schema.prisma but forgotten in TENANT_SCOPED_MODELS
    // silently loses all isolation, and nothing else in the codebase would
    // notice. This is the regression test for that specific mistake.
    it('every tenant-scoped model in the schema is listed in the scoping extension', async () => {
      const carriesTenantId = Prisma.dmmf.datamodel.models
        .filter((model) => model.fields.some((field) => field.name === 'tenantId'))
        .map((model) => model.name);
      expect(carriesTenantId.length).toBeGreaterThan(0);

      const unscoped: string[] = [];
      for (const name of carriesTenantId) {
        const delegate = (scoped as unknown as Record<string, { findMany: (args?: unknown) => Promise<unknown[]> }>)[
          name.charAt(0).toLowerCase() + name.slice(1)
        ];
        // If the model is scoped, a query with no tenant context throws
        // (getCurrentTenantId has nothing to return); if it is not scoped,
        // the query runs happily and returns every tenant's rows.
        const scopedProperly = await delegate
          .findMany({ take: 1 })
          .then(() => false)
          .catch(() => true);
        if (!scopedProperly) unscoped.push(name);
      }

      expect(unscoped).toEqual([]);
    });
  });
});
