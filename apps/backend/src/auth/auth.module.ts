import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LineAuthService } from './line-auth.service';
import { LineModule } from '../line/line.module';
import { MailerService } from './mailer.service';
import { PasswordService } from './password.service';
import { JwtStrategy } from './jwt.strategy';
import { RolesGuard } from './roles.guard';

@Module({
  imports: [
    PassportModule,
    ConfigModule,
    LineModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') ?? 'change-me-in-production',
        signOptions: { expiresIn: '8h' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, LineAuthService, MailerService, PasswordService, JwtStrategy, RolesGuard],
  // PasswordService is exported for EmployeesController's HR-initiated reset;
  // MailerService for AlertService, which delivers operator alerts by email.
  exports: [RolesGuard, PasswordService, MailerService],
})
export class AuthModule {}
