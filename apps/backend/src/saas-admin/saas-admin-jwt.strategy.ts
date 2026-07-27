import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedSaasAdmin, SaasAdminJwtPayload } from './saas-admin-jwt-payload.interface';

/**
 * Registered under the Passport strategy name 'saas-jwt' — deliberately not
 * 'jwt' (already claimed by auth/jwt.strategy.ts), since that strategy
 * unconditionally calls getCurrentTenantId() and would throw for these
 * routes, which are excluded from TenantMiddleware and never have a tenant
 * context.
 */
@Injectable()
export class SaasAdminJwtStrategy extends PassportStrategy(Strategy, 'saas-jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('SAAS_ADMIN_JWT_SECRET') ?? 'change-me-in-production-saas-admin',
    });
  }

  async validate(payload: SaasAdminJwtPayload): Promise<AuthenticatedSaasAdmin> {
    // Re-check the admin still exists — a deleted admin's old token should
    // stop working immediately, not just at expiry.
    const admin = await this.prisma.saasAdmin.findUnique({ where: { id: payload.sub } });
    if (!admin) {
      throw new UnauthorizedException('Session is no longer valid');
    }

    return { id: admin.id, email: admin.email, name: admin.name };
  }
}
