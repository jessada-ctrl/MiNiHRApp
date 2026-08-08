import { Injectable, Logger } from '@nestjs/common';
import { access, constants } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';

export type CheckState = 'up' | 'down';

export interface ReadinessReport {
  status: 'ok' | 'unhealthy';
  checks: Record<string, { state: CheckState; detail?: string }>;
}

/**
 * How long a single readiness probe is allowed to take.
 *
 * Without a cap, an unreachable database doesn't fail the probe — it hangs
 * it, until the monitor's own timeout fires and reports something vaguer
 * than "the database is down". Failing fast and saying why is the whole
 * point of this endpoint.
 */
const CHECK_TIMEOUT_MS = 3000;

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Everything the process needs in order to serve a request correctly.
   *
   * Deliberately narrow: only dependencies whose absence makes the app
   * *wrong*, not merely degraded. SMTP being unreachable, for instance, is
   * not in here — it would take the whole deployment red over a mail relay
   * hiccup, while leave requests, approvals and attendance all keep working.
   * That belongs in alerting, not in the signal that decides whether this
   * instance should receive traffic.
   */
  async readiness(): Promise<ReadinessReport> {
    const [database, attachments] = await Promise.all([this.checkDatabase(), this.checkAttachmentStorage()]);

    const checks = { database, attachments };
    const status = Object.values(checks).every((check) => check.state === 'up') ? 'ok' : 'unhealthy';
    return { status, checks };
  }

  private async checkDatabase(): Promise<{ state: CheckState; detail?: string }> {
    return this.timed('database', async () => {
      await this.prisma.$queryRaw`SELECT 1`;
    });
  }

  /**
   * Medical certificates are written here (FR-2.2). A read-only or missing
   * mount doesn't surface until an employee tries to upload one and gets a
   * 500, so it is checked up front — this is the failure mode the entrypoint's
   * mountpoint check exists to prevent, caught again at runtime in case the
   * volume goes away later.
   */
  private async checkAttachmentStorage(): Promise<{ state: CheckState; detail?: string }> {
    const dir = resolve(process.env.ATTACHMENTS_DIR?.trim() || 'var/attachments');
    return this.timed('attachments', async () => {
      await access(dir, constants.W_OK);
    });
  }

  private async timed(name: string, check: () => Promise<unknown>): Promise<{ state: CheckState; detail?: string }> {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`timed out after ${CHECK_TIMEOUT_MS}ms`)), CHECK_TIMEOUT_MS).unref(),
    );

    try {
      await Promise.race([check(), timeout]);
      return { state: 'up' };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.error(`Readiness check "${name}" failed: ${detail}`);
      return { state: 'down', detail };
    }
  }
}
