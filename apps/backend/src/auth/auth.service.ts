import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { TENANT_PRISMA } from '../prisma/prisma.module';
import { AuthenticatedUser, JwtPayload } from './jwt-payload.interface';

@Injectable()
export class AuthService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: PrismaClient,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string): Promise<{ accessToken: string; user: AuthenticatedUser }> {
    // Only tenant_admin and approver log in via email/password on the web
    // dashboard — regular employees authenticate through LINE OTP binding
    // (FR-2.1), not this endpoint.
    const employee = await this.prisma.employee.findFirst({
      where: { email, role: { in: ['tenant_admin', 'approver'] }, status: 'active' },
    });

    // Same generic error whether the email doesn't exist or the password is
    // wrong — don't let the response leak which case it was.
    if (!employee || !employee.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordOk = await bcrypt.compare(password, employee.passwordHash);
    if (!passwordOk) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const payload: JwtPayload = {
      sub: employee.id,
      tenantId: employee.tenantId,
      role: employee.role as JwtPayload['role'],
      email: employee.email,
    };

    return {
      accessToken: await this.jwt.signAsync(payload),
      user: {
        id: employee.id,
        tenantId: employee.tenantId,
        role: employee.role as JwtPayload['role'],
        email: employee.email,
        fullName: employee.fullName,
      },
    };
  }
}
