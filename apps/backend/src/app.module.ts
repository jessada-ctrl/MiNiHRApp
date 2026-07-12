import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { TenantMiddleware } from './tenant/tenant.middleware';
import { WebhookModule } from './webhook/webhook.module';

@Module({
  imports: [PrismaModule, WebhookModule],
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
