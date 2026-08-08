import { DeleteObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

export interface StoredBackup {
  key: string;
  sizeBytes: number;
  createdAt: Date;
}

/**
 * Where backup archives land.
 *
 * S3-compatible object storage when BACKUP_S3_BUCKET is set — MinIO, R2, S3,
 * Spaces, anything with the API — otherwise a local directory.
 *
 * The local mode is a real fallback rather than a stub, but it is *not*
 * equivalent: a backup on the same machine as the database survives "I
 * dropped the wrong table" and does not survive the machine. Both are
 * failures worth planning for; only one of them is the one people remember.
 * `isOffsite()` reports which mode is active so the app can say so out loud
 * at boot instead of leaving it to be discovered during a restore.
 */
@Injectable()
export class BackupStorageService implements OnModuleInit {
  private readonly logger = new Logger(BackupStorageService.name);
  private s3: S3Client | null = null;
  private bucket = '';
  private prefix = '';
  private readonly localDir = resolve(process.env.BACKUP_DIR?.trim() || join(process.cwd(), 'var', 'backups'));

  onModuleInit() {
    this.bucket = process.env.BACKUP_S3_BUCKET?.trim() ?? '';
    this.prefix = (process.env.BACKUP_S3_PREFIX?.trim() ?? 'lala-backups').replace(/^\/+|\/+$/g, '');

    if (!this.bucket) {
      this.logger.warn(`BACKUP_S3_BUCKET is not set — backups will be written to ${this.localDir}, on this machine only.`);
      return;
    }

    this.s3 = new S3Client({
      // Endpoint is what makes this work against MinIO/R2/Spaces rather than
      // AWS only. Region still has to be *something*: the signing algorithm
      // includes it, and non-AWS providers simply ignore the value.
      endpoint: process.env.BACKUP_S3_ENDPOINT?.trim() || undefined,
      region: process.env.BACKUP_S3_REGION?.trim() || 'us-east-1',
      // Most non-AWS S3 implementations don't do virtual-host-style buckets.
      forcePathStyle: process.env.BACKUP_S3_FORCE_PATH_STYLE !== 'false',
      credentials: process.env.BACKUP_S3_ACCESS_KEY_ID
        ? {
            accessKeyId: process.env.BACKUP_S3_ACCESS_KEY_ID,
            secretAccessKey: process.env.BACKUP_S3_SECRET_ACCESS_KEY ?? '',
          }
        : undefined,
    });

    this.logger.log(`Backups will be uploaded to s3://${this.bucket}/${this.prefix}`);
  }

  isOffsite(): boolean {
    return this.s3 !== null;
  }

  describeDestination(): string {
    return this.s3 ? `s3://${this.bucket}/${this.prefix}` : this.localDir;
  }

  async put(filePath: string): Promise<string> {
    const key = `${this.prefix}/${basename(filePath)}`;
    const { size } = await stat(filePath);

    if (!this.s3) {
      await mkdir(this.localDir, { recursive: true });
      const { copyFile } = await import('node:fs/promises');
      await copyFile(filePath, join(this.localDir, basename(filePath)));
      return join(this.localDir, basename(filePath));
    }

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: createReadStream(filePath),
        // Required when the body is a stream — without it the SDK has to
        // buffer the whole archive in memory to work the length out.
        ContentLength: size,
      }),
    );
    return `s3://${this.bucket}/${key}`;
  }

  async list(): Promise<StoredBackup[]> {
    if (!this.s3) {
      await mkdir(this.localDir, { recursive: true });
      const names = await readdir(this.localDir);
      return Promise.all(
        names.map(async (name) => {
          const info = await stat(join(this.localDir, name));
          return { key: join(this.localDir, name), sizeBytes: info.size, createdAt: info.mtime };
        }),
      );
    }

    const found: StoredBackup[] = [];
    let token: string | undefined;
    do {
      const page = await this.s3.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: `${this.prefix}/`, ContinuationToken: token }),
      );
      for (const object of page.Contents ?? []) {
        if (object.Key) {
          found.push({ key: object.Key, sizeBytes: object.Size ?? 0, createdAt: object.LastModified ?? new Date(0) });
        }
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);

    return found;
  }

  async delete(key: string): Promise<void> {
    if (!this.s3) {
      await rm(key, { force: true });
      return;
    }
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
