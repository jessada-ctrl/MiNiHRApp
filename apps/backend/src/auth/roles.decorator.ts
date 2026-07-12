import { SetMetadata } from '@nestjs/common';
import { JwtPayload } from './jwt-payload.interface';

export const ROLES_KEY = 'roles';

/** Use on a route alongside JwtAuthGuard + RolesGuard, e.g. @Roles('tenant_admin'). */
export const Roles = (...roles: JwtPayload['role'][]) => SetMetadata(ROLES_KEY, roles);
