import { Module } from '@nestjs/common';
import { AttachmentStorageService } from './attachment-storage.service';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';

@Module({
  controllers: [AttachmentsController],
  providers: [AttachmentsService, AttachmentStorageService],
  // LeaveRequestsService resolves + encrypts the attachment id when a request
  // is submitted; SchedulerService prunes attachments no request claimed.
  exports: [AttachmentsService, AttachmentStorageService],
})
export class AttachmentsModule {}
