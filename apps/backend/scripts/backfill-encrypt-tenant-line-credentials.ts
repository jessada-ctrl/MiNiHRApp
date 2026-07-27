/**
 * One-time NFR-2 migration: encrypts any Tenant.lineChannelSecretEnc /
 * lineChannelAccessTokenEnc values that predate AES-256-GCM encryption and
 * are still stored as plaintext.
 *
 * Needed because these columns existed (and were writable via
 * settings.service.ts) before EncryptionService did — any tenant that
 * configured LINE credentials pre-migration has a plaintext value in a
 * column whose decrypt() call now expects "iv:authTag:encrypted". Without
 * this backfill, LineSignatureGuard/LineMessagingService would throw for
 * that tenant the first time they try to decrypt it.
 *
 * Detection: our ciphertext format is always exactly 3 ':'-separated
 * base64 segments (iv, authTag, encrypted) — anything else is treated as
 * legacy plaintext and gets encrypted in place.
 *
 * Usage: ts-node --project prisma/tsconfig.seed.json scripts/backfill-encrypt-tenant-line-credentials.ts
 */
import { PrismaClient } from '@prisma/client';
import { encryptWithKey, ENCRYPTION_KEY_LENGTH } from '../src/crypto/encryption.util';

const prisma = new PrismaClient();

const INSECURE_DEV_KEY_BASE64 = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
const encryptionKey = Buffer.from(process.env.TENANT_CRED_ENCRYPTION_KEY ?? INSECURE_DEV_KEY_BASE64, 'base64');
if (encryptionKey.length !== ENCRYPTION_KEY_LENGTH) {
  throw new Error(`TENANT_CRED_ENCRYPTION_KEY must decode to exactly ${ENCRYPTION_KEY_LENGTH} bytes (got ${encryptionKey.length})`);
}

const CIPHERTEXT_SHAPE = /^[A-Za-z0-9+/]+=*:[A-Za-z0-9+/]+=*:[A-Za-z0-9+/]+=*$/;
function looksAlreadyEncrypted(value: string): boolean {
  return CIPHERTEXT_SHAPE.test(value);
}

async function main() {
  const tenants = await prisma.tenant.findMany({
    select: { id: true, companyName: true, lineChannelSecretEnc: true, lineChannelAccessTokenEnc: true },
  });

  let migrated = 0;
  for (const tenant of tenants) {
    const data: Record<string, string> = {};

    if (tenant.lineChannelSecretEnc && !looksAlreadyEncrypted(tenant.lineChannelSecretEnc)) {
      data.lineChannelSecretEnc = encryptWithKey(encryptionKey, tenant.lineChannelSecretEnc);
    }
    if (tenant.lineChannelAccessTokenEnc && !looksAlreadyEncrypted(tenant.lineChannelAccessTokenEnc)) {
      data.lineChannelAccessTokenEnc = encryptWithKey(encryptionKey, tenant.lineChannelAccessTokenEnc);
    }

    if (Object.keys(data).length > 0) {
      await prisma.tenant.update({ where: { id: tenant.id }, data });
      console.log(`Encrypted plaintext LINE credential(s) for tenant "${tenant.companyName}" (${tenant.id}): ${Object.keys(data).join(', ')}`);
      migrated++;
    }
  }

  console.log(`Done. ${migrated}/${tenants.length} tenant(s) migrated.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
