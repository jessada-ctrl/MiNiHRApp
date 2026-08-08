import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AttachmentsModule } from './attachments/attachments.module';
import { AlertsModule } from './alerts/alerts.module';
import { AttendanceModule } from './attendance/attendance.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { BackupModule } from './backup/backup.module';
import { CryptoModule } from './crypto/crypto.module';
import { EmployeesModule } from './employees/employees.module';
import { HealthModule } from './health/health.module';
import { HolidaysModule } from './holidays/holidays.module';
import { LeaveRequestsModule } from './leave-requests/leave-requests.module';
import { LeaveTypesModule } from './leave-types/leave-types.module';
import { OrgModule } from './org/org.module';
import { RequestIdMiddleware } from './observability/request-id.middleware';
import { PrismaModule } from './prisma/prisma.module';
import { ReportsModule } from './reports/reports.module';
import { SaasAdminModule } from './saas-admin/saas-admin.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { SettingsModule } from './settings/settings.module';
import { TenantMiddleware } from './tenant/tenant.middleware';
import { WebhookModule } from './webhook/webhook.module';
import { WorkflowsModule } from './workflows/workflows.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    // A blanket per-IP ceiling, deliberately far above what any human using
    // the LIFF app or HR dashboard will hit — this is a backstop against a
    // script hammering the API, not a usage quota. The endpoints that
    // actually need a tight limit (login, OTP request/verify) declare their
    // own much stricter @Throttle in auth.controller.ts, and the LINE
    // webhook opts out entirely (all of one tenant's employees share LINE's
    // egress IPs, so an IP-keyed limit there would throttle real traffic).
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    PrismaModule,
    CryptoModule,
    AuditModule,
    WebhookModule,
    AuthModule,
    EmployeesModule,
    OrgModule,
    AttendanceModule,
    AttachmentsModule,
    LeaveTypesModule,
    WorkflowsModule,
    LeaveRequestsModule,
    HolidaysModule,
    ReportsModule,
    SettingsModule,
    SchedulerModule,
    SaasAdminModule,
    HealthModule,
    AlertsModule,
    BackupModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // saas-admin/* is platform-level (SaaS Super Admin auth/tenant
    // management, §2.2 + FR-1.1) — never scoped to a single tenant, so it
    // must never hit TenantMiddleware (which would 400 "unknown tenant" for
    // any request whose Host header isn't a real tenant subdomain).
    // Ahead of TenantMiddleware on purpose: a request rejected for an
    // unknown subdomain still needs an id in its log line, and that is
    // exactly the request someone will be trying to find later.
    consumer.apply(RequestIdMiddleware).forRoutes('*');

    consumer
      .apply(TenantMiddleware)
      // The health endpoints answer for the deployment, not for any one
      // customer: an uptime monitor hits them on the bare host with no
      // tenant subdomain, and TenantMiddleware would 400 every probe.
      .exclude('/', 'health', 'health/ready', {
        path: 'saas-admin/*path',
        method: RequestMethod.ALL,
      })
      .forRoutes('*');
  }
}
