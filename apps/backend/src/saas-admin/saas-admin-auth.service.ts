import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedSaasAdmin, SaasAdminJwtPayload } from './saas-admin-jwt-payload.interface';

@Injectable()
export class SaasAdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string): Promise<{ accessToken: string; admin: AuthenticatedSaasAdmin }> {
    const admin = await this.prisma.saasAdmin.findUnique({ where: { email } });
    if (!admin) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordOk = await bcrypt.compare(password, admin.passwordHash);
    if (!passwordOk) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const payload: SaasAdminJwtPayload = { sub: admin.id, email: admin.email };

    return {
      accessToken: await this.jwt.signAsync(payload),
      admin: { id: admin.id, email: admin.email, name: admin.name },
    };
  }
}
