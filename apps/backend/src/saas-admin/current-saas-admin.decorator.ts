import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedSaasAdmin } from './saas-admin-jwt-payload.interface';

/** Use inside a SaasAdminAuthGuard-protected route: handler(@CurrentSaasAdmin() admin: AuthenticatedSaasAdmin) */
export const CurrentSaasAdmin = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthenticatedSaasAdmin => {
  return ctx.switchToHttp().getRequest<{ user: AuthenticatedSaasAdmin }>().user;
});
