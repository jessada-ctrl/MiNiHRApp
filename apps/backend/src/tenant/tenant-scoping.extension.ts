import { Prisma } from '@prisma/client';
import { getCurrentTenantId } from './tenant-context';

/**
 * NFR-1 enforcement: every model in this set carries a tenant_id column and
 * MUST be scoped to the current tenant on every query. Keep this in sync
 * with prisma/schema.prisma — every model except Tenant and SaasAdmin.
 */
const TENANT_SCOPED_MODELS = new Set([
  'Branch',
  'Department',
  'Employee',
  'OtpVerification',
  'LeaveType',
  'LeaveQuota',
  'LeaveRequest',
  'LeaveAttachment',
  'ApprovalWorkflow',
  'ApprovalWorkflowStep',
  'LeaveApprovalAction',
  'AttendanceQrCode',
  'AttendanceLog',
  'Holiday',
  'NotificationLog',
  'AuditLog',
]);

/**
 * Prisma Client Extension that transparently injects `tenant_id` into every
 * query and write for tenant-scoped models, using the AsyncLocalStorage
 * context set by TenantMiddleware. This is the "Global Context Interceptor"
 * described in NFR-1 — application code should never need to (and never
 * should) pass tenantId manually in a `where`/`data` clause.
 *
 * Defense-in-depth note: this covers the ORM layer. Postgres Row-Level
 * Security policies are a reasonable follow-up hardening step before
 * production launch, but are not required to start local development.
 */
export const tenantScopingExtension = Prisma.defineExtension((client) =>
  client.$extends({
    name: 'tenant-scoping',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_SCOPED_MODELS.has(model)) {
            return query(args);
          }
          const tenantId = getCurrentTenantId();
          const a = args as Record<string, any>;

          switch (operation) {
            case 'create':
              a.data = { ...a.data, tenantId };
              break;
            case 'createMany':
            case 'createManyAndReturn':
              a.data = Array.isArray(a.data)
                ? a.data.map((d: Record<string, any>) => ({ ...d, tenantId }))
                : { ...a.data, tenantId };
              break;
            case 'upsert':
              a.where = { ...a.where, tenantId };
              a.create = { ...a.create, tenantId };
              break;
            default:
              // findUnique(OrThrow), findFirst(OrThrow), findMany, update,
              // updateMany, delete, deleteMany, count, aggregate, groupBy
              a.where = { ...(a.where ?? {}), tenantId };
              break;
          }
          return query(a as typeof args);
        },
      },
    },
  }),
);
