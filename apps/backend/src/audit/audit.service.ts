import { Injectable } from '@nestjs/common';

export interface AuditLogInput {
  userId: string;
  action: string;
  targetTable: string;
  targetId?: string;
  ipAddress: string;
  /**
   * Only needed when `tx` comes from the *unscoped* PrismaService (e.g.
   * writes against the Tenant model itself, which is excluded from
   * tenant-scoping — see tenant-scoping.extension.ts). Tenant-scoped callers
   * should omit this and let the extension auto-inject it on create, same
   * as every other tenant-scoped model.
   */
  tenantId?: string;
}

/** Minimal shape AuditService needs from a (possibly transactional) Prisma client. */
export interface AuditableTx {
  auditLog: { create: (args: { data: AuditLogInput }) => Promise<unknown> };
}

/**
 * NFR-4: write the audit row in the SAME transaction as the change it
 * describes (pass the `tx` from prisma.$transaction(async (tx) => ...)) so
 * that if the audit write fails, the underlying change rolls back too —
 * never a real change with no record of it.
 */
@Injectable()
export class AuditService {
  async record(tx: AuditableTx, input: AuditLogInput): Promise<void> {
    await tx.auditLog.create({ data: input });
  }
}
