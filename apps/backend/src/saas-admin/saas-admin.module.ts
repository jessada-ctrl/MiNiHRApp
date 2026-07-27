import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { SaasAdminAuthController } from './saas-admin-auth.controller';
import { SaasAdminAuthService } from './saas-admin-auth.service';
import { SaasAdminJwtStrategy } from './saas-admin-jwt.strategy';
import { SaasAdminOverviewController, SaasAdminTenantsController } from './saas-admin-tenants.controller';
import { SaasAdminTenantsService } from './saas-admin-tenants.service';

/**
 * Platform-level module: SaaS Super Admin auth ('saas-jwt' Passport strategy,
 * fully separate from AuthModule's tenant-scoped 'jwt' strategy) plus tenant
 * lifecycle management (FR-1.1, §2.2). Every route here is under the
 * `saas-admin/*` prefix, which app.module.ts excludes from TenantMiddleware
 * — these requests never have (and must never need) a tenant context.
 */
@Module({
  imports: [
    PassportModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('SAAS_ADMIN_JWT_SECRET') ?? 'change-me-in-production-saas-admin',
        signOptions: { expiresIn: '8h' },
      }),
    }),
  ],
  controllers: [SaasAdminAuthController, SaasAdminTenantsController, SaasAdminOverviewController],
  providers: [SaasAdminAuthService, SaasAdminTenantsService, SaasAdminJwtStrategy],
})
export class SaasAdminModule {}
