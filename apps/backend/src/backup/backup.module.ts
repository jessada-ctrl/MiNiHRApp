import { Module } from '@nestjs/common';
import { BackupStorageService } from './backup-storage.service';
import { BackupService } from './backup.service';

@Module({
  providers: [BackupService, BackupStorageService],
  exports: [BackupService],
})
export class BackupModule {}
