import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AttachmentsModule } from './attachments/attachments.module';
import { AttendanceModule } from './attendance/attendance.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CryptoModule } from './crypto/crypto.module';
import { EmployeesModule } from './employees/employees.module';
import { HolidaysModule } from './holidays/holidays.module';
import { LeaveRequestsModule } from './leave-requests/leave-requests.module';
import { LeaveTypesModule } from './leave-types/leave-types.module';
import { OrgModule } from './org/org.module';
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
  ],
  controllers: [AppController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // saas-admin/* is platform-level (SaaS Super Admin auth/tenant
    // management, §2.2 + FR-1.1) — never scoped to a single tenant, so it
    // must never hit TenantMiddleware (which would 400 "unknown tenant" for
    // any request whose Host header isn't a real tenant subdomain).
    consumer
      .apply(TenantMiddleware)
      .exclude('/', 'health', {
        path: 'saas-admin/*path',
        method: RequestMethod.ALL,
      })
      .forRoutes('*');
  }
}
