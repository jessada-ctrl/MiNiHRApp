/**
 * One-off: creates (or resets the password of) a SaaS Super Admin account.
 * Idempotent — upserts on email, so it's safe to re-run (e.g. to rotate a
 * lost password) rather than only working once.
 *
 * There's no self-service signup for this role (§2.2: platform-owner level,
 * not exposed via any API) — this script is the only way to provision one
 * outside of prisma/seed.ts's local-dev fixture data.
 *
 * Usage: ts-node --project prisma/tsconfig.seed.json scripts/create-saas-admin.ts <email> <name> <password>
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const [email, name, password] = process.argv.slice(2);
  if (!email || !name || !password) {
    throw new Error('Usage: create-saas-admin.ts <email> <name> <password>');
  }
  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await prisma.saasAdmin.upsert({
    where: { email },
    update: { name, passwordHash },
    create: { email, name, passwordHash },
  });

  console.log(`SaaS Super Admin ready: ${admin.email} (${admin.id})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
