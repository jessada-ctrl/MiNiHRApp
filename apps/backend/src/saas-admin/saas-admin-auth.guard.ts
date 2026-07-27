import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class SaasAdminAuthGuard extends AuthGuard('saas-jwt') {}
