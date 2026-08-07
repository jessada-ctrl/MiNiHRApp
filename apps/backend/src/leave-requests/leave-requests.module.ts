import { Module } from '@nestjs/common';
import { AttachmentsModule } from '../attachments/attachments.module';
import { LineModule } from '../line/line.module';
import { LeaveRequestsController } from './leave-requests.controller';
import { LeaveRequestsService } from './leave-requests.service';

@Module({
  imports: [LineModule, AttachmentsModule],
  controllers: [LeaveRequestsController],
  providers: [LeaveRequestsService],
  exports: [LeaveRequestsService],
})
export class LeaveRequestsModule {}
