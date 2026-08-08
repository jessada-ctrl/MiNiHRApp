import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AlertService } from './alert.service';

/**
 * Global because anything that can fail badly enough to need a human should
 * be able to say so without threading an import through its module chain —
 * and the ones that need it most (background jobs) are exactly the ones no
 * user is watching.
 */
@Global()
@Module({
  imports: [AuthModule],
  providers: [AlertService],
  exports: [AlertService],
})
export class AlertsModule {}
