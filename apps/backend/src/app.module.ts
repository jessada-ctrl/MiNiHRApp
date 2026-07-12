import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { TenantMiddleware } from './tenant/tenant.middleware';
import { WebhookModule } from './webhook/webhook.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, WebhookModule, AuthModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // TODO: also exclude platform-level routes (SaaS Super Admin auth/tenant
    // management) once they exist — those aren't scoped to a single tenant.
    consumer
      .apply(TenantMiddleware)
      .exclude('/', 'health')
      .forRoutes('*');
  }
}
