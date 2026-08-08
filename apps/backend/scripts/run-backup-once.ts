/**
 * Takes a backup right now, instead of waiting for the nightly cron.
 *
 * The reason this exists is the ten minutes before a risky migration or a
 * schema change, when "there's a backup from last night" is not the same
 * answer as "there's a backup from just now".
 *
 * Usage: npm run --workspace=apps/backend backup:now
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { BackupService } from '../src/backup/backup.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'warn', 'error'] });
  try {
    const result = await app.get(BackupService).backupNow();
    console.log(`\nDatabase:    ${result.databaseArchive} (${result.databaseBytes} bytes)`);
    console.log(`Attachments: ${result.attachmentsArchive ?? 'none — no attachments directory found'} (${result.attachmentBytes} bytes)`);
    console.log(`Pruned:      ${result.prunedCount} archive(s) past the retention window`);
    console.log('\nVerify it actually restores:');
    console.log('  npm run --workspace=apps/backend verify:backup -- <path-to-.dump>');
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
