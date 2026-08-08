# LaLa'

LINE-integrated Leave & Attendance Management System (Multi-Tenant SaaS). See [Doc/MiniHR_SRS-V1.md](Doc/MiniHR_SRS-V1.md) for the full specification.

**Read before touching any UI color:** [Doc/Lala_DesignSystem-Colors-V1.md](Doc/Lala_DesignSystem-Colors-V1.md) — the navy+gold token system, which token to reach for, and the contrast traps that are easy to reintroduce.

## Stack

- **Backend:** NestJS + TypeScript + Prisma → PostgreSQL (`apps/backend`)
- **Web Admin (HR Dashboard):** Next.js + Tailwind (`apps/web-admin`)
- **LIFF App (Employee/Approver, runs inside LINE):** Next.js + Tailwind (`apps/liff-app`)

## Local development quick start

1. Copy env files:
   ```bash
   cp .env.example apps/backend/.env
   cp .env.example apps/web-admin/.env.local
   cp .env.example apps/liff-app/.env.local
   ```
   (Trim each copy down to the variables that app actually uses — see comments in `.env.example`.)

2. Install dependencies (root, workspaces):
   ```bash
   npm install
   ```

3. Start local PostgreSQL:
   ```bash
   npm run db:up
   ```

4. Run database migrations:
   ```bash
   npm run --workspace=apps/backend prisma:migrate
   ```

   Also seed a demo tenant so there's something to test against:
   ```bash
   npm run --workspace=apps/backend prisma:seed
   ```

5. Start everything (each in its own terminal):
   ```bash
   npm run dev:backend      # http://localhost:3001
   npm run dev:web-admin    # http://localhost:3000
   npm run dev:liff         # http://localhost:3002
   ```

## Tests

```bash
npm run test     --workspace=apps/backend   # unit — no database needed
npm run test:e2e --workspace=apps/backend   # integration — needs a running database
```

`test:e2e` includes `test/tenant-isolation.e2e-spec.ts`, which asserts NFR-1
against a real database with two tenants: a row created by one must be
invisible and unwritable to the other, across reads, writes and bulk
operations. It also fails if a model gains a `tenant_id` column in
`schema.prisma` without being added to `TENANT_SCOPED_MODELS` in
`src/tenant/tenant-scoping.extension.ts` — the one mistake that would silently
remove isolation for that table. It creates and tears down its own tenants,
so it is safe against a development database.

## Passwords

Three routes, in order of preference:

| Situation | Route |
|---|---|
| Knows their password, wants a new one | `/profile` → เปลี่ยนรหัสผ่าน |
| Forgot it, can read their company email | `/login` → ลืมรหัสผ่าน? → emailed link, valid 60 min, single use |
| Can't reach their company email at all | HR: `/employees` → 🔑 รีเซ็ตรหัสผ่าน → temp password shown once |

Two properties worth knowing about, because neither is visible from the UI:

- **A password change ends every other session.** JWTs are stateless with an
  8h life, so `employees.password_changed_at` is compared against each
  token's `iat` on every request — otherwise a reset would leave whoever knew
  the old password signed in for the rest of the day. The endpoint that
  changes a password hands back a replacement token for the caller's own
  session.
- **A password the employee didn't choose can't become permanent.** New
  accounts, bulk imports and HR resets all set `must_change_password`, and
  the admin app shows nothing but the change-password screen until it clears.
  This is enforced in the UI rather than the API: the server would otherwise
  need an exception for the very endpoint used to escape the state, and
  getting that wrong locks people out entirely.

`POST /auth/forgot-password` answers identically whether or not the address
belongs to a real account, and the link it emails is built from the request's
own `Host` — never from anything in the request body, which would make it a
way to send genuine company-branded email containing an attacker's link.

## Operations

### Monitoring

| Endpoint | Answers | Point it at |
|---|---|---|
| `GET /health` | Is the process alive? Touches nothing. | A container liveness probe |
| `GET /health/ready` | Can it actually serve? Checks the database and the attachments volume. **503 when not.** | Your uptime monitor |

Use `/health/ready`, not `/health`. The failure it exists to catch is the
database being unreachable, and a monitor keyed on the status code has to
see a non-200 to notice — the earlier single endpoint returned 200 with
`{"status": "degraded"}`, so the dashboard stayed green while the app could
serve nothing. The 503 body names which dependency is down, so the alert
says *what* broke.

Liveness stays 200 in that situation on purpose: restarting the app does not
fix a database outage, it just adds downtime to a bad moment.

Logs are one JSON object per line in production (`LOG_FORMAT=json`), each
carrying `requestId` and `tenant`. Every response echoes `X-Request-Id`, and
an inbound one is reused, so a report of "it failed at 14:32" becomes a
filter rather than a scroll.

### Backups

A nightly job (02:00 by default) dumps the database with `pg_dump -Fc` and
tars the attachments volume, then uploads both and prunes past
`BACKUP_RETENTION_DAYS`.

This does **not** replace the hosting provider's own Postgres snapshots — it
covers what they don't. A provider snapshot lives with the provider, is
restorable only through the provider, and says nothing about the attachments
volume, where every uploaded medical certificate lives. Those are not
recoverable from a database dump at all, because the rows hold only
references.

Set `BACKUP_S3_BUCKET` and friends. Without them archives are written to
local disk, which survives "I dropped the wrong table" and does not survive
losing the machine — the app warns about this at boot and says which mode
it is in.

Two things watch the backups, because a job that fails and a job that
silently stops are different failures:

- a failed run alerts immediately (`backup.failed`)
- an hourly check alerts when the newest archive is over 36h old
  (`backup.stale`) — the case where the cron isn't running at all, which
  produces no failures to alert on

Retention never deletes the newest 3 archives regardless of age, so a wrong
clock or a mistyped retention window can't empty the bucket.

```bash
# Take one right now — worth doing before a risky migration
npm run --workspace=apps/backend backup:now

# Prove an archive actually restores. Do this on a schedule, not just once.
npm run --workspace=apps/backend verify:backup -- ./lala-db-2026-08-08.dump
```

`verify:backup` restores into a throwaway database, checks the core tables
came back populated and that the `audit_logs` immutability triggers survived,
then drops it. The nightly job only checks its archive is structurally
readable (`pg_restore --list`), which catches truncated uploads but cannot
tell you the dump would come back as a working database. Set
`VERIFY_DATABASE_URL` to run it against a scratch server instead of
production.

### Restoring

```bash
createdb lala_restored
pg_restore --no-owner --no-privileges --dbname lala_restored lala-db-<stamp>.dump
tar -xzf lala-attachments-<stamp>.tar.gz -C "$ATTACHMENTS_DIR"
```

Restore the attachments archive too, or every leave request will reference a
certificate that no longer exists.

### Alerts

Failures reach the team by email (`ALERT_EMAIL_TO`) and LINE
(`ALERT_LINE_*`, the platform's own OA — never a tenant's channel). The same
alert key stays quiet for an hour after firing: a broken dependency fails on
a schedule, and the first incident must not bury the next one.

## Multi-tenant deployment

One built image serves every customer. Nothing tenant-specific is baked in at
build time — the front-ends read it at runtime:

| Value | Where it comes from |
|---|---|
| Which tenant | The subdomain the browser is on (`Host` header → `TenantMiddleware`) |
| API base URL | The same origin the page was served from |
| LINE LIFF ID | `GET /tenant/public-config`, per tenant, from the DB |
| LINE channel id / secret / token | Each tenant admin's own `/settings` page |

Onboarding a new customer is therefore: create the tenant in the Super Admin
console (this provisions the subdomain), point that subdomain's DNS at the
same deployment, and hand the tenant admin the `/settings` page — it shows
them the Webhook URL and LIFF Endpoint URL to paste into their own LINE
Developers console. No rebuild, no redeploy.

> `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_TENANT_SUBDOMAIN` and
> `NEXT_PUBLIC_LIFF_ID` still exist for local development, where there is no
> real subdomain to read. They must stay unset in the deployed image —
> `next build` inlines them, and a value set there pins the image to a single
> customer.

### Required in production

`docker-entrypoint.sh` refuses to start without these, because each one fails
*quietly* rather than loudly when missing:

- `DATABASE_URL`, `JWT_SECRET`
- `TENANT_CRED_ENCRYPTION_KEY` — without it the app falls back to a key that
  is a literal in this repo
- `SMTP_HOST` (+ port/user/password/`MAIL_FROM`) — without it OTP codes are
  logged to stdout instead of emailed, and no employee can ever bind their
  LINE account
- `ATTACHMENTS_DIR` — **must be a mounted volume.** The entrypoint checks this
  with `mountpoint` and exits if it isn't: medical certificates written inside
  the container image are destroyed on the next deploy, with no error at the
  time it happens. Override with `ALLOW_EPHEMERAL_ATTACHMENTS=true` for
  throwaway test environments only.

See `.env.example` for the full list and how to generate the key.

## Known local-dev gotchas (this machine)

Found and fixed while first standing this up — leaving them here so nobody burns hours rediscovering them.

1. **Postgres on 5432/5433 gets its auth silently intercepted on this machine.** Something (never fully identified — possibly endpoint security software) answers on those ports and always rejects password auth, even against a freshly-initialized container with `trust` auth. `docker-compose.yml` maps Postgres to host port **48321** instead — confirmed clean with a direct `node-postgres` connection test. If `prisma migrate`/the backend can't reach the DB on a new machine, suspect the same thing before assuming the container or credentials are broken.
2. **`nest build` (and therefore `npm run start:dev`'s watch/build step) can silently produce nothing** in this repo, because it lives inside a OneDrive-synced folder. Nest's default `deleteOutDir: true` wipes the whole `dist/` tree before every build; on OneDrive that delete+recreate races with the sync engine and the rebuilt files sometimes just never reappear (build tools report success anyway). Fixed by setting `deleteOutDir: false` in `apps/backend/nest-cli.json`. If builds ever go silent again, that's the first thing to check — and consider excluding `node_modules/` and `dist/` from OneDrive sync (or moving the repo outside OneDrive entirely) if it keeps causing trouble.

## Repo layout

```
apps/
  backend/      NestJS API + per-tenant LINE webhook gateway
  web-admin/    HR Admin web dashboard
  liff-app/     Employee & Approver LINE LIFF app
Doc/            SRS and other specs
qa/             QA bug reports and test plans (see qa/bugs/README.md)
```
