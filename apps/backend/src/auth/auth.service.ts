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
    // In the target design, regular employees authenticate through LINE OTP
    // binding (FR-2.1), not email/password — that's still true and this
    // endpoint isn't meant to become the LIFF app's login. But FR-2.1 needs
    // a real LINE Developers account (external dependency, not yet set up),
    // so email/password is temporarily open to every active role — including
    // 'employee' — purely so the leave-request/approval flow can be built
    // and tested end-to-end before LINE integration lands. Re-add the
    // role:{in:['tenant_admin','approver']} restriction once FR-2.1 ships.
    const employee = await this.prisma.employee.findFirst({
      where: { email, status: 'active' },
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
        mustChangePassword: employee.mustChangePassword,
      },
    };
  }
}
