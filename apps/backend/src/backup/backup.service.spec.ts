import { ALWAYS_KEEP_NEWEST, connectionEnv, selectExpiredBackups } from './backup.service';

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
const archive = (key: string, age: number) => ({ key, createdAt: daysAgo(age) });

describe('selectExpiredBackups', () => {
  const cutoff = daysAgo(30);

  it('deletes archives older than the cutoff', () => {
    const backups = [archive('d1', 1), archive('d2', 2), archive('d3', 3), archive('old', 40)];

    expect(selectExpiredBackups(backups, cutoff).map((b) => b.key)).toEqual(['old']);
  });

  it('keeps everything inside the retention window', () => {
    const backups = [archive('d1', 1), archive('d10', 10), archive('d29', 29)];

    expect(selectExpiredBackups(backups, cutoff)).toEqual([]);
  });

  // The important one. A stopped cron, a wrong clock or a mistyped retention
  // window all make every archive look expired — and this is the only code in
  // the system that deletes backups, so getting it wrong is discovered at the
  // exact moment one is needed.
  it('never deletes the newest archives, however old they all are', () => {
    const backups = [archive('a', 100), archive('b', 200), archive('c', 300), archive('d', 400)];

    const doomed = selectExpiredBackups(backups, cutoff);

    expect(doomed.map((b) => b.key)).toEqual(['d']);
    expect(backups.length - doomed.length).toBe(ALWAYS_KEEP_NEWEST);
  });

  it('deletes nothing when there are only a few archives in total', () => {
    expect(selectExpiredBackups([archive('a', 500), archive('b', 600)], cutoff)).toEqual([]);
  });

  it('is not fooled by arrival order — age decides, not position', () => {
    const backups = [archive('old', 90), archive('new', 1), archive('older', 120), archive('mid', 5), archive('newest', 0)];

    expect(selectExpiredBackups(backups, cutoff).map((b) => b.key).sort()).toEqual(['old', 'older']);
  });
});

describe('connectionEnv', () => {
  it('splits a URL into the PG* variables libpq reads', () => {
    const env = connectionEnv('postgresql://lala:s3cret@db.internal:48321/lala?schema=public');

    expect(env).toMatchObject({
      PGHOST: 'db.internal',
      PGPORT: '48321',
      PGUSER: 'lala',
      PGPASSWORD: 's3cret',
      PGDATABASE: 'lala',
    });
  });

  it('decodes credentials that were percent-encoded in the URL', () => {
    const env = connectionEnv('postgresql://us%40er:p%40ss%2Fword@host/db');

    expect(env.PGUSER).toBe('us@er');
    expect(env.PGPASSWORD).toBe('p@ss/word');
  });

  it('honours an explicit sslmode and defaults to prefer', () => {
    expect(connectionEnv('postgresql://u:p@h/db?sslmode=require').PGSSLMODE).toBe('require');
    expect(connectionEnv('postgresql://u:p@h/db').PGSSLMODE).toBe('prefer');
  });

  it('refuses a URL with no database name rather than dumping the wrong thing', () => {
    expect(() => connectionEnv('postgresql://u:p@h')).toThrow(/database name/);
  });

  it('refuses to run with no DATABASE_URL at all', () => {
    expect(() => connectionEnv(undefined)).toThrow(/DATABASE_URL/);
  });
});
