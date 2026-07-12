import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { PrismaClient } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { TENANT_PRISMA } from '../prisma/prisma.module';
import { getCurrentTenantId } from '../tenant/tenant-context';
import { AuthenticatedUser, JwtPayload } from './jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @Inject(TENANT_PRISMA) private readonly prisma: PrismaClient,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') ?? 'change-me-in-production',
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    // Defense in depth on top of NFR-1: a token issued for tenant A must
    // never be usable against a request that TenantMiddleware resolved to
    // tenant B (e.g. wrong subdomain), even if the signature is valid.
    const requestTenantId = getCurrentTenantId();
    if (payload.tenantId !== requestTenantId) {
      throw new UnauthorizedException('Token does not belong to this tenant');
    }

    // Re-check the employee still exists, is still active, and still holds
    // this role — a deactivated/role-changed employee's old token should
    // stop working immediately, not just at expiry.
    const employee = await this.prisma.employee.findUnique({ where: { id: payload.sub } });
    if (!employee || employee.status !== 'active' || employee.role !== payload.role) {
      throw new UnauthorizedException('Session is no longer valid');
    }

    return {
      id: employee.id,
      tenantId: employee.tenantId,
      role: employee.role as JwtPayload['role'],
      email: employee.email,
      fullName: employee.fullName,
    };
  }
}
