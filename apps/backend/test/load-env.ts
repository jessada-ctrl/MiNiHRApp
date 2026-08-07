import { config } from 'dotenv';
import { resolve } from 'node:path';

/**
 * The e2e suites talk to a real database (that is the point — see
 * tenant-isolation.e2e-spec.ts), so they need the same DATABASE_URL the app
 * uses. Nest loads apps/backend/.env via ConfigModule at runtime, but that
 * happens too late for a test file that constructs its own PrismaClient at
 * import time, so it is loaded here instead.
 *
 * Existing environment variables win, so CI can point the suite at its own
 * throwaway database without editing anything.
 */
config({ path: resolve(__dirname, '..', '.env') });

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not set and apps/backend/.env does not define it — the e2e suite needs a real database. Start one with `npm run db:up` and copy .env.example to apps/backend/.env.',
  );
}
