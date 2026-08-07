import { Injectable, InternalServerErrorException, Logger, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, resolve, sep } from 'node:path';

/**
 * Where medical-certificate bytes actually live.
 *
 * Filesystem-backed, under ATTACHMENTS_DIR (default `var/attachments` beside
 * the repo). **In a container this path MUST be a mounted volume** — the
 * default lands on the container's ephemeral layer, so every redeploy would
 * silently drop every certificate uploaded since the last one. See
 * docker-entrypoint.sh, which refuses to start if that looks to be the case.
 *
 * Kept behind this narrow interface (write / read / remove, opaque string
 * key) precisely so swapping in S3 or GCS later is a change to this one file
 * rather than to every caller.
 */
@Injectable()
export class AttachmentStorageService implements OnModuleInit {
  private readonly logger = new Logger(AttachmentStorageService.name);
  private readonly root = resolve(process.env.ATTACHMENTS_DIR?.trim() || join(process.cwd(), 'var', 'attachments'));

  async onModuleInit() {
    await mkdir(this.root, { recursive: true });
    this.logger.log(`Leave attachments stored under ${this.root}`);
  }

  /**
   * Returns the storage key to persist on the LeaveAttachment row. Tenant id
   * is the first path segment so one customer's uploads are never interleaved
   * with another's on disk — which keeps "export/delete everything for tenant
   * X" a directory operation rather than a query-and-hope.
   */
  async write(tenantId: string, originalFilename: string, contents: Buffer): Promise<string> {
    // The stored name is a fresh UUID, never anything derived from the
    // uploader-supplied filename: that string reaches us straight from a
    // phone and is the classic path-traversal vector. Only the extension is
    // carried over, and only after the caller has already validated the
    // file's real content type.
    const key = `${tenantId}/${randomUUID()}${extname(originalFilename).toLowerCase().slice(0, 10)}`;
    const target = this.resolveKey(key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents);
    return key;
  }

  read(key: string): ReadStream {
    return createReadStream(this.resolveKey(key));
  }

  async remove(key: string): Promise<void> {
    try {
      await unlink(this.resolveKey(key));
    } catch (error) {
      // Already gone is the desired end state, not a failure.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  /**
   * Second line of defence behind the UUID naming above: even a key that
   * somehow contained `..` or an absolute path can only ever resolve inside
   * the storage root, or this throws rather than touching the filesystem.
   */
  private resolveKey(key: string): string {
    if (isAbsolute(key)) throw new InternalServerErrorException('Invalid attachment key');
    const target = resolve(this.root, key);
    if (target !== this.root && !target.startsWith(this.root + sep)) {
      throw new InternalServerErrorException('Invalid attachment key');
    }
    return target;
  }
}
