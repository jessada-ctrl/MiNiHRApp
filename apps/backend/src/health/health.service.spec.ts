import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let prisma: { $queryRaw: jest.Mock };
  let attachmentsDir: string;
  let previousDir: string | undefined;

  beforeEach(async () => {
    prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    attachmentsDir = await mkdtemp(join(tmpdir(), 'lala-health-'));
    previousDir = process.env.ATTACHMENTS_DIR;
    process.env.ATTACHMENTS_DIR = attachmentsDir;
  });

  afterEach(async () => {
    if (previousDir === undefined) delete process.env.ATTACHMENTS_DIR;
    else process.env.ATTACHMENTS_DIR = previousDir;
    await rm(attachmentsDir, { recursive: true, force: true });
  });

  const service = () => new HealthService(prisma as unknown as PrismaService);

  it('is ok when the database answers and the attachment volume is writable', async () => {
    await expect(service().readiness()).resolves.toEqual({
      status: 'ok',
      checks: { database: { state: 'up' }, attachments: { state: 'up' } },
    });
  });

  // The bug this endpoint exists to fix: the old /health returned HTTP 200
  // with {"status":"degraded"} when the database was gone, so every uptime
  // monitor reported the deployment healthy while it could serve nothing.
  it('is unhealthy — not merely degraded — when the database is unreachable', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));

    const report = await service().readiness();

    expect(report.status).toBe('unhealthy');
    expect(report.checks.database.state).toBe('down');
    expect(report.checks.database.detail).toContain('connection refused');
  });

  it('is unhealthy when the attachment volume has gone away', async () => {
    process.env.ATTACHMENTS_DIR = join(attachmentsDir, 'not-mounted');

    const report = await service().readiness();

    expect(report.status).toBe('unhealthy');
    expect(report.checks.attachments.state).toBe('down');
    expect(report.checks.database.state).toBe('up');
  });

  it('names the failing dependency rather than reporting a bare failure', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));
    process.env.ATTACHMENTS_DIR = join(attachmentsDir, 'not-mounted');

    const report = await service().readiness();

    expect(Object.entries(report.checks).filter(([, c]) => c.state === 'down').map(([name]) => name)).toEqual([
      'database',
      'attachments',
    ]);
  });

  // A hung connection must fail the probe rather than hang it, or the alert
  // says "timeout" instead of "the database is down".
  it('fails a check that hangs instead of waiting on it', async () => {
    prisma.$queryRaw.mockImplementation(() => new Promise(() => {}));

    const report = await service().readiness();

    expect(report.checks.database.state).toBe('down');
    expect(report.checks.database.detail).toContain('timed out');
  }, 10_000);
});
