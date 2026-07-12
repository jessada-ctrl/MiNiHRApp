---
id: BUG-001
title: audit_logs table is not immutable at the DB level — app's own DB role can UPDATE/DELETE rows
severity: critical
status: fixed
related_fr: NFR-4
reported_by: qa-tester
reported_date: 2026-07-12
fixed_by: dev (Claude)
fixed_date: 2026-07-12
---

## Description

NFR-4 requires `audit_logs` to be an insert-only, immutable log, and the SRS ERD notes
(`Doc/MiniHR_SRS-V1.md` line ~406) are explicit: "ตาราง `audit_logs` ต้องกำหนดสิทธิ์ระดับ
Database ห้าม Role ของแอปพลิเคชันฝั่ง HR ทำการ `UPDATE`/`DELETE` โดยเด็ดขาดตาม NFR-4" (the
`audit_logs` table must set database-level permissions that absolutely forbid the HR
application's DB role from `UPDATE`/`DELETE`). In the running local-dev database, the
app's own Postgres role (`minihr`, the same role in `DATABASE_URL` that the NestJS backend
connects with) has full `UPDATE`, `DELETE`, and even `TRUNCATE` privileges on `audit_logs`.
Application-layer code (`AuditService.record`) only ever calls `create`, but nothing at the
database grant level stops any other code path — or a compromised app process, or a raw SQL
console using the same credentials — from silently editing or erasing the audit trail. This
defeats the entire purpose of NFR-4 (tamper-evident audit history for role/permission/quota
changes).

## Steps to Reproduce

1. Ensure Postgres is reachable per the dev setup: `docker compose exec db psql -U minihr -d minihr` from the repo root (or via the exposed port `localhost:48321`, user `minihr`, password `minihr_local_dev`, db `minihr`).
2. As HR Admin (`hr@testco.local` / `Passw0rd!`), log in via `POST /auth/login` and `PATCH /employees/:id` to change any employee's `role` (or `status`/`directManagerId`) so at least one `audit_logs` row exists. Note the `target_id`.
3. Connect with the app's own DB credentials and run:
   ```sql
   UPDATE audit_logs SET action='tampered' WHERE target_id='<target_id>';
   DELETE FROM audit_logs WHERE target_id='<target_id>';
   ```
4. Optionally confirm grants directly:
   ```sql
   SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_name='audit_logs';
   ```

## Expected Result

Per NFR-4 and the ERD note, both the `UPDATE` and the `DELETE` statements should be rejected
by the database (`ERROR: permission denied for table audit_logs`) when run as the HR
application's role — immutability must be enforced at the DB-grant level, not just by the
app never issuing those statements.

## Actual Result

Both statements succeed:
```
UPDATE 3
DELETE 3
```
The subsequent grants query confirms the `minihr` role holds `INSERT, SELECT, UPDATE, DELETE,
TRUNCATE, REFERENCES, TRIGGER` on `audit_logs` — i.e., no restriction at all. Note: running
this reproduction actually deleted the 3 legitimate audit rows created during this test pass
(role change, manager reassignment, status change on employee `e3821a89-cc20-4d56-9764-ef2ab65911e2`),
which itself demonstrates the impact — real audit history was permanently destroyed using
only the credentials the running backend already holds.

## Suggested Area

- `apps/backend/prisma/migrations/20260712121115_init/migration.sql` — no `REVOKE`/grant
  restriction statements exist for `audit_logs`.
- `docker-compose.yml` — only a single Postgres role (`minihr`) is provisioned and used for
  both migrations and the app's runtime `DATABASE_URL`, so a straightforward `REVOKE UPDATE,
  DELETE, TRUNCATE ON audit_logs FROM minihr` isn't possible without first splitting into a
  migration-owner role and a lower-privilege runtime role (or adding a `BEFORE UPDATE OR
  DELETE` trigger on `audit_logs` that unconditionally raises an exception, which would work
  under a single shared role too).
- `apps/backend/src/audit/audit.service.ts` — app-layer usage is already insert-only and
  correct; this is purely a missing DB-level control, not an application logic bug.

## Dev Notes

Went with the trigger approach the report suggested, not a role split — this project's migrations and the app's runtime `DATABASE_URL` share one Postgres role (`minihr`), and splitting that is real infra work with no benefit over a trigger: a `BEFORE UPDATE OR DELETE` trigger that unconditionally raises rejects the operation regardless of which role is connected, so it can't be bypassed by using the app's own credentials in a raw SQL console either — the exact hole this bug reported.

Added migration `20260712160846_audit_logs_immutable`: `prevent_audit_log_mutation()` PL/pgSQL function + `BEFORE UPDATE`/`BEFORE DELETE` triggers on `audit_logs`.

Verified directly against Postgres (not just re-reading the code):
- `UPDATE audit_logs SET action='tampered' WHERE true;` → `ERROR: audit_logs is immutable (NFR-4) — UPDATE is not permitted on this table`
- `DELETE FROM audit_logs WHERE true;` → same error, `DELETE` not permitted
- Row count unchanged after both attempts (5 rows survived)
- Normal app-layer `INSERT` (via `PATCH /employees/:id` changing status) still succeeds and the row count increased by exactly 1 — the trigger only blocks `UPDATE`/`DELETE`, `INSERT` is untouched

While fixing this, also addressed the structural concern from the same QA pass (not filed as a separate bug, no second tenant existed to reproduce it against): `TenantMiddleware` honored the `X-Tenant-Subdomain` dev-convenience header unconditionally in every environment. Added a `process.env.NODE_ENV === 'production'` gate so the header is only honored outside production — production now derives the tenant strictly from `req.hostname`. Confirmed the normal local-dev login flow (header present, `NODE_ENV` unset) is unaffected.
