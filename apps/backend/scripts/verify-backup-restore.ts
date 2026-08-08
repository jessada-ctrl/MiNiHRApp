/**
 * Restores a backup archive into a throwaway database and checks the data is
 * actually there.
 *
 * A backup nobody has ever restored is not a backup — it is a file that is
 * assumed to be one. The nightly job checks that its archive is structurally
 * readable (`pg_restore --list`), which catches truncation and failed
 * uploads, but it cannot tell you that the dump would come back as a working
 * database. This does.
 *
 *   npm run --workspace=apps/backend verify:backup -- ./lala-db-2026-08-08.dump
 *
 * Restores into `<database>_restorecheck_<pid>`, asserts every table the app
 * depends on is present and populated, then drops it again — always, even on
 * failure, so a botched run doesn't leave a stray database behind.
 *
 * Point VERIFY_DATABASE_URL at a scratch Postgres to keep this off the
 * production server entirely; it falls back to DATABASE_URL's server, which
 * is convenient but does mean a restore competing with live traffic.
 */
import { config } from 'dotenv';
import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';
import { promisify } from 'node:util';
import { connectionEnv } from '../src/backup/backup.service';

// Standalone script — it doesn't boot Nest, so nothing else loads the env
// file that holds DATABASE_URL. Real environment variables still win, which
// is what lets VERIFY_DATABASE_URL point this at a scratch server.
config({ path: resolvePath(__dirname, '..', '.env') });

const run = promisify(execFile);

/**
 * Tables whose emptiness would mean the restore silently produced a shell.
 * Deliberately the ones without which the product cannot function at all —
 * not every table, since a young tenant legitimately has no leave requests
 * yet.
 */
const MUST_HAVE_ROWS = ['tenants', 'employees', 'leave_types'];

async function main() {
  const archivePath = process.argv[2];
  if (!archivePath) {
    console.error('Usage: verify:backup -- <path-to-.dump>');
    process.exit(2);
  }
  await access(archivePath);

  const sourceUrl = process.env.VERIFY_DATABASE_URL ?? process.env.DATABASE_URL;
  const env = connectionEnv(sourceUrl);
  const scratch = `${env.PGDATABASE}_restorecheck_${process.pid}`;

  // Every psql/createdb call has to connect to *something* that isn't the
  // database being created, so admin commands run against `postgres`.
  const adminEnv = { ...env, PGDATABASE: 'postgres' };

  console.log(`Restoring ${archivePath} into ${scratch} on ${env.PGHOST}:${env.PGPORT}`);
  await run('createdb', [scratch], { env: adminEnv });

  try {
    // pg_restore exits non-zero on benign notices (missing roles, comments on
    // extensions). --exit-on-error would abort on those; the assertions below
    // are what decide whether the restore actually worked.
    await run('pg_restore', ['--no-owner', '--no-privileges', '--dbname', scratch, archivePath], {
      env: adminEnv,
      maxBuffer: 64 * 1024 * 1024,
    }).catch((error: unknown) => {
      console.warn(`pg_restore reported problems (continuing to the checks): ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
    });

    const restoredEnv = { ...env, PGDATABASE: scratch };
    let failures = 0;

    for (const table of MUST_HAVE_ROWS) {
      const count = await countRows(table, restoredEnv);
      if (count === null) {
        console.error(`  ✗ ${table} — table is missing from the restored database`);
        failures++;
      } else if (count === 0) {
        console.error(`  ✗ ${table} — restored but empty`);
        failures++;
      } else {
        console.log(`  ✓ ${table} — ${count} row(s)`);
      }
    }

    // The audit trail carries its own immutability triggers (NFR-4). If they
    // don't come back with the schema, the restored database would accept
    // edits to history — worth knowing before it becomes the live one.
    const triggers = await countRows("pg_trigger WHERE tgname LIKE 'audit_logs_no_%'", restoredEnv);
    if (triggers && triggers >= 2) {
      console.log(`  ✓ audit_logs immutability triggers restored (${triggers})`);
    } else {
      console.error('  ✗ audit_logs immutability triggers are missing from the restore');
      failures++;
    }

    if (failures > 0) {
      console.error(`\nFAILED — ${failures} check(s) did not pass. This archive should not be relied on.`);
      process.exitCode = 1;
    } else {
      console.log('\nOK — archive restores into a working database.');
    }
  } finally {
    await run('dropdb', ['--force', scratch], { env: adminEnv }).catch((error: unknown) => {
      console.error(`Could not drop scratch database ${scratch} — remove it by hand: ${error instanceof Error ? error.message : String(error)}`);
    });
  }
}

/** Returns null when the relation doesn't exist, which is a distinct failure from "exists but empty". */
async function countRows(relation: string, env: NodeJS.ProcessEnv): Promise<number | null> {
  try {
    const { stdout } = await run('psql', ['--tuples-only', '--no-align', '--command', `SELECT count(*) FROM ${relation}`], { env });
    return Number(stdout.trim());
  } catch {
    return null;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
