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

    // A password change ends every session that predates it. JWTs are
    // stateless with an 8h life, so without this check a reset would leave
    // whoever knew the old password signed in for the rest of the day —
    // precisely the situation the reset was performed to end.
    //
    // Compared in whole seconds, not milliseconds: `iat` is a second-
    // resolution claim, so the token minted immediately after a change
    // carries an `iat` that floors to just *before* the sub-second
    // passwordChangedAt, and a millisecond comparison would reject the
    // replacement token the change itself just handed out.
    if (employee.passwordChangedAt && payload.iat !== undefined) {
      if (payload.iat < Math.floor(employee.passwordChangedAt.getTime() / 1000)) {
        throw new UnauthorizedException('Password was changed — please sign in again');
      }
    }

    return {
      id: employee.id,
      tenantId: employee.tenantId,
      role: employee.role as JwtPayload['role'],
      email: employee.email,
      fullName: employee.fullName,
      mustChangePassword: employee.mustChangePassword,
    };
  }
}
