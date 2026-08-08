import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { AlertService } from '../alerts/alert.service';
import { BackupStorageService } from './backup-storage.service';

const run = promisify(execFile);

const RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS ?? 30);
/**
 * How long without a successful backup before the platform complains about
 * itself. Comfortably over the 24h cron interval so an ordinary late run
 * doesn't page anyone, comfortably under 48h so two missed days can't pass
 * unnoticed.
 */
const STALE_AFTER_MS = 36 * 60 * 60 * 1000;

/** Anything larger than this is a sign something has gone wrong, not a healthy dump. */
const MAX_EXEC_BUFFER = 64 * 1024 * 1024;

export interface BackupResult {
  databaseArchive: string;
  attachmentsArchive: string | null;
  databaseBytes: number;
  attachmentBytes: number;
  prunedCount: number;
}

/**
 * Nightly logical backup of the database and the attachment volume.
 *
 * Easypanel takes its own snapshots of the Postgres service, and this does
 * not replace them — it covers what they don't. A provider snapshot lives
 * with the provider, is restorable only through the provider, and says
 * nothing about the attachments volume, where every uploaded medical
 * certificate lives. Losing those is not recoverable from a database dump at
 * all, because the rows only hold references.
 *
 * `pg_dump -Fc` (custom format) rather than plain SQL: it compresses, it can
 * be restored selectively, and — the reason it matters here — `pg_restore
 * --list` can read its table of contents, which is a genuine structural
 * check that the archive is intact. A truncated gzip of plain SQL looks fine
 * until the day you need it.
 */
@Injectable()
export class BackupService implements OnModuleInit {
  private readonly logger = new Logger(BackupService.name);
  private lastSuccessAt: Date | null = null;
  private running = false;

  constructor(
    private readonly storage: BackupStorageService,
    private readonly alerts: AlertService,
  ) {}

  async onModuleInit() {
    if (process.env.BACKUP_ENABLED === 'false') {
      this.logger.warn('BACKUP_ENABLED=false — no backups will be taken.');
      return;
    }

    // Checked at boot rather than at 02:00, so a missing binary is found
    // while someone is watching a deploy instead of during an incident.
    try {
      const { stdout } = await run('pg_dump', ['--version']);
      this.logger.log(`Backups enabled using ${stdout.trim()} → ${this.storage.describeDestination()}`);
    } catch {
      this.logger.error('pg_dump is not available on PATH — database backups cannot run. Install postgresql-client in the image.');
    }

    if (!this.storage.isOffsite()) {
      this.logger.warn('Backups are being written to local disk. A backup on the same machine as the database does not survive losing that machine.');
    }
  }

  @Cron(process.env.BACKUP_CRON ?? '0 2 * * *')
  async runScheduledBackup(): Promise<void> {
    if (process.env.BACKUP_ENABLED === 'false') return;
    // A dump that overruns into the next night must not have a second one
    // started on top of it — two pg_dumps and two uploads competing would
    // make an already-slow night worse.
    if (this.running) {
      this.logger.warn('Previous backup is still running — skipping this run.');
      return;
    }

    this.running = true;
    try {
      const result = await this.backupNow();
      this.lastSuccessAt = new Date();
      this.alerts.clear('backup.failed');
      this.logger.log(
        `Backup complete: db ${formatBytes(result.databaseBytes)}, attachments ${formatBytes(result.attachmentBytes)}, pruned ${result.prunedCount}`,
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await this.alerts.send({
        key: 'backup.failed',
        severity: 'critical',
        title: 'Nightly backup failed',
        detail: `${detail}\n\nDestination: ${this.storage.describeDestination()}\nLast success: ${this.lastSuccessAt?.toISOString() ?? 'never since this process started'}`,
      });
    } finally {
      this.running = false;
    }
  }

  /**
   * A cron that stops firing produces no failures, so nothing alerts — the
   * quietest and most dangerous way for backups to stop. This checks the
   * opposite condition: not "did a run fail" but "has a run succeeded
   * recently".
   */
  @Cron('0 * * * *')
  async checkBackupFreshness(): Promise<void> {
    if (process.env.BACKUP_ENABLED === 'false') return;

    const newest = await this.newestBackupAt().catch(() => null);
    const reference = newest ?? this.lastSuccessAt;

    if (!reference) {
      // Nothing at the destination at all. On a freshly deployed instance
      // that is simply "the first backup hasn't run yet", so it stays a
      // warning rather than paging someone at 3am on launch night.
      await this.alerts.send({
        key: 'backup.none',
        severity: 'warning',
        title: 'No backup has been taken yet',
        detail: `Nothing found at ${this.storage.describeDestination()}. Expected if this deployment is less than a day old; investigate otherwise.`,
      });
      return;
    }

    const age = Date.now() - reference.getTime();
    if (age > STALE_AFTER_MS) {
      await this.alerts.send({
        key: 'backup.stale',
        severity: 'critical',
        title: 'Backups have stopped',
        detail: `The newest backup at ${this.storage.describeDestination()} is ${Math.round(age / 3600000)} hours old (${reference.toISOString()}). The scheduled job may not be running at all.`,
      });
    } else {
      this.alerts.clear('backup.stale');
      this.alerts.clear('backup.none');
    }
  }

  /** Exposed so an operator can force a backup before a risky migration. */
  async backupNow(): Promise<BackupResult> {
    const workDir = await mkdtemp(join(tmpdir(), 'lala-backup-'));
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');

      const dumpPath = join(workDir, `lala-db-${stamp}.dump`);
      await this.dumpDatabase(dumpPath);
      await this.assertRestorable(dumpPath);
      const databaseBytes = (await stat(dumpPath)).size;
      const databaseArchive = await this.storage.put(dumpPath);

      let attachmentsArchive: string | null = null;
      let attachmentBytes = 0;
      const attachmentsPath = join(workDir, `lala-attachments-${stamp}.tar.gz`);
      if (await this.archiveAttachments(attachmentsPath)) {
        attachmentBytes = (await stat(attachmentsPath)).size;
        attachmentsArchive = await this.storage.put(attachmentsPath);
      }

      const prunedCount = await this.pruneOldBackups();

      return { databaseArchive, attachmentsArchive, databaseBytes, attachmentBytes, prunedCount };
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }

  private async dumpDatabase(target: string): Promise<void> {
    await run('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '--file', target], {
      env: connectionEnv(),
      maxBuffer: MAX_EXEC_BUFFER,
    });
  }

  /**
   * Reads the archive's table of contents back. Cheap, and it catches the
   * failure that matters most: an upload or a dump that ended early. It is
   * not a restore — see scripts/verify-backup-restore.ts for that.
   */
  private async assertRestorable(dumpPath: string): Promise<void> {
    const { stdout } = await run('pg_restore', ['--list', dumpPath], { maxBuffer: MAX_EXEC_BUFFER });
    if (!stdout.includes('TABLE DATA')) {
      throw new Error('pg_dump produced an archive with no table data — refusing to treat it as a backup');
    }
  }

  /** Returns false when there is nothing to archive, which is not an error. */
  private async archiveAttachments(target: string): Promise<boolean> {
    const dir = process.env.ATTACHMENTS_DIR?.trim() || join(process.cwd(), 'var', 'attachments');
    try {
      const info = await stat(dir);
      if (!info.isDirectory()) return false;
    } catch {
      return false;
    }

    // The archive name is passed relative to `cwd` rather than as an absolute
    // path: tar reads "host:path" in the -f argument, so a Windows path like
    // C:\tmp\x.tar.gz is taken as a request to write to a machine called "C"
    // over rsh. GNU's --force-local fixes that but doesn't exist in bsdtar,
    // whereas a relative name is understood identically everywhere.
    //
    // -C keeps paths inside the archive relative to the storage root, which
    // is what lets it be restored into a differently-located volume later.
    await run('tar', ['-czf', basename(target), '-C', dir, '.'], { cwd: dirname(target), maxBuffer: MAX_EXEC_BUFFER });
    return true;
  }

  private async newestBackupAt(): Promise<Date | null> {
    const backups = await this.storage.list();
    if (backups.length === 0) return null;
    return backups.reduce((newest, b) => (b.createdAt > newest ? b.createdAt : newest), new Date(0));
  }

  private async pruneOldBackups(): Promise<number> {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const doomed = selectExpiredBackups(await this.storage.list(), cutoff);

    for (const backup of doomed) {
      await this.storage.delete(backup.key);
    }
    return doomed.length;
  }
}

/** Archives always kept, however old, so retention can never empty the bucket. */
export const ALWAYS_KEEP_NEWEST = 3;

/**
 * Which archives retention may delete.
 *
 * Separate from the deleting so the rule can be tested without a storage
 * backend, because the failure mode is unrecoverable: this is the only code
 * in the system that deletes backups, and a wrong answer is discovered at
 * the moment one is needed.
 *
 * The newest few always survive regardless of age. A wrong clock, a
 * mistyped BACKUP_RETENTION_DAYS, or a cron that stopped running a month ago
 * would each otherwise make *everything* expired — and "delete every backup"
 * is a far worse outcome than "keep more than asked".
 */
export function selectExpiredBackups<T extends { key: string; createdAt: Date }>(backups: T[], cutoff: Date): T[] {
  const newestFirst = [...backups].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return newestFirst.slice(ALWAYS_KEEP_NEWEST).filter((backup) => backup.createdAt.getTime() < cutoff.getTime());
}

/**
 * Turns DATABASE_URL into the PG* variables libpq reads.
 *
 * Deliberately not `pg_dump -d "$DATABASE_URL"`: process arguments are
 * world-readable through /proc on Linux, so passing the URL that way puts
 * the database password where any process on the box can read it. The
 * environment of another process is not readable the same way.
 */
export function connectionEnv(url = process.env.DATABASE_URL): NodeJS.ProcessEnv {
  if (!url) throw new Error('DATABASE_URL is not set');

  const parsed = new URL(url);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!database) throw new Error('DATABASE_URL has no database name');

  return {
    ...process.env,
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || '5432',
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGDATABASE: database,
    // Managed providers usually require TLS; `prefer` uses it when offered
    // and still works against a plain local container.
    PGSSLMODE: parsed.searchParams.get('sslmode') ?? 'prefer',
    PGCONNECT_TIMEOUT: '15',
  };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, exponent)).toFixed(1)} ${units[exponent]}`;
}
