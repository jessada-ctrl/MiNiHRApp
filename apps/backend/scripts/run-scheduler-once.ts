/**
 * Manually triggers SchedulerService's daily job (FR-3.3 reminders + FR-4.3
 * holiday notices) once, immediately — for local testing without waiting
 * for the real 09:00 cron, and useful later for an on-demand ops run too.
 *
 * Boots the full Nest DI graph without starting the HTTP server
 * (NestFactory.createApplicationContext), the standard pattern for a
 * one-off script that needs real services/modules rather than a bare
 * PrismaClient (unlike prisma/seed.ts or scripts/setup-line-rich-menu.ts).
 *
 * Usage: ts-node --project prisma/tsconfig.seed.json scripts/run-scheduler-once.ts
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SchedulerService } from '../src/scheduler/scheduler.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'warn', 'error'] });
  try {
    await app.get(SchedulerService).runDailyJobs();
    console.log('Done.');
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
