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
