import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
export const ENCRYPTION_KEY_LENGTH = 32;

/**
 * Plain (non-DI) AES-256-GCM helpers shared by EncryptionService (used
 * inside the Nest app) and prisma/seed.ts (a standalone ts-node script that
 * runs outside Nest's DI container) — kept here so both encrypt/decrypt the
 * exact same way instead of duplicating the algorithm in two places.
 *
 * Ciphertext is packed as a single string — base64(iv) + ':' + base64(authTag)
 * + ':' + base64(encrypted) — so it fits in the existing `*Enc` columns
 * without a schema migration for separate iv/tag columns.
 */
export function encryptWithKey(key: Buffer, plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(':');
}

export function decryptWithKey(key: Buffer, payload: string): string {
  const [ivB64, authTagB64, encryptedB64] = payload.split(':');
  if (!ivB64 || !authTagB64 || !encryptedB64) {
    throw new Error('Malformed ciphertext: expected "iv:authTag:encrypted" (base64 segments)');
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedB64, 'base64')), decipher.final()]);
  return decrypted.toString('utf8');
}
