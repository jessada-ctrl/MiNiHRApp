import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decryptWithKey, encryptWithKey, ENCRYPTION_KEY_LENGTH } from './encryption.util';

// Local-dev-only fallback so a fresh checkout doesn't need secrets to boot.
// Never reused in production: TENANT_CRED_ENCRYPTION_KEY must be set there.
const INSECURE_DEV_KEY_BASE64 = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

/**
 * NFR-2: AES-256-GCM at-rest encryption for tenant-owned secrets (LINE
 * Channel Secret / Access Token). See encryption.util.ts for the actual
 * cipher logic — this class just resolves the key from config for use
 * inside the Nest DI container (prisma/seed.ts uses the util directly since
 * it runs outside Nest).
 */
@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const keyBase64 = config.get<string>('TENANT_CRED_ENCRYPTION_KEY');
    if (!keyBase64) {
      // Fatal rather than a warning once real customers are involved: the
      // fallback key is a literal in this file, so shipping with it means
      // every tenant's LINE credentials and every medical-certificate
      // reference are encrypted with a key anyone reading the repo has.
      // A refusal to boot is loud and fixable; a warning in a log nobody
      // reads is how that ships to production unnoticed.
      if (config.get<string>('NODE_ENV') === 'production') {
        throw new Error(
          'TENANT_CRED_ENCRYPTION_KEY is required when NODE_ENV=production. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
        );
      }
      this.logger.warn(
        'TENANT_CRED_ENCRYPTION_KEY is not set — falling back to an insecure well-known dev key. Set this env var before deploying to production.',
      );
    }
    this.key = Buffer.from(keyBase64 ?? INSECURE_DEV_KEY_BASE64, 'base64');
    if (this.key.length !== ENCRYPTION_KEY_LENGTH) {
      throw new Error(`TENANT_CRED_ENCRYPTION_KEY must decode to exactly ${ENCRYPTION_KEY_LENGTH} bytes (got ${this.key.length})`);
    }
  }

  encrypt(plaintext: string): string {
    return encryptWithKey(this.key, plaintext);
  }

  decrypt(payload: string): string {
    return decryptWithKey(this.key, payload);
  }
}
