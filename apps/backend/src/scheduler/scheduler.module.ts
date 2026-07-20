import { Module } from '@nestjs/common';
import { HolidaysModule } from '../holidays/holidays.module';
import { LeaveRequestsModule } from '../leave-requests/leave-requests.module';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [LeaveRequestsModule, HolidaysModule],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
