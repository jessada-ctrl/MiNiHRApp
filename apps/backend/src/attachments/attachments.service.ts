import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { ReadStream } from 'node:fs';
import { EncryptionService } from '../crypto/encryption.service';
import { TENANT_PRISMA } from '../prisma/prisma.module';
import { getCurrentTenantId } from '../tenant/tenant-context';
import type { AuthenticatedUser } from '../auth/jwt-payload.interface';
import { AttachmentStorageService } from './attachment-storage.service';

/** FR-2.2: "ไฟล์แนบใบรับรองแพทย์ต้องเป็นไฟล์ประเภท JPG, PNG หรือ PDF เท่านั้น ขนาดไฟล์ไม่เกิน 5MB". */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

/**
 * Accepted types, keyed by the leading bytes of the file itself.
 *
 * The browser-supplied `mimetype` on a multipart part is just a string the
 * client chose and is not evidence of anything — renaming `payload.html` to
 * `cert.jpg` sets it to image/jpeg. Since these files are later served back
 * to HR and approvers, trusting it would turn the certificate upload into a
 * stored-XSS vector against the people reviewing leave requests. The real
 * content type is sniffed from the magic bytes instead, and the sniffed
 * value — never the client's — is what gets stored and later echoed in the
 * download's Content-Type header.
 */
const MAGIC_BYTES: { mime: string; ext: string; test: (buf: Buffer) => boolean }[] = [
  { mime: 'image/jpeg', ext: '.jpg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    ext: '.png',
    test: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  { mime: 'application/pdf', ext: '.pdf', test: (b) => b.length > 4 && b.subarray(0, 5).toString('latin1') === '%PDF-' },
];

interface WorkflowStepSnapshot {
  approverEmployeeId: string;
}

@Injectable()
export class AttachmentsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: PrismaClient,
    private readonly storage: AttachmentStorageService,
    private readonly encryption: EncryptionService,
  ) {}

  /** Encrypted form of an attachment id, for `leave_requests.attachment_url_enc` (NFR-2). */
  encryptAttachmentId(attachmentId: string): string {
    return this.encryption.encrypt(attachmentId);
  }

  /** Inverse of encryptAttachmentId. Throws on a value written with a different key. */
  decryptAttachmentId(attachmentUrlEnc: string): string {
    return this.encryption.decrypt(attachmentUrlEnc);
  }

  async upload(file: Express.Multer.File, uploaderEmployeeId: string) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('ไม่พบไฟล์ที่อัปโหลด');
    }
    // Multer's own limit already rejects oversized parts before this, but the
    // check is repeated here so the rule holds no matter how this service is
    // called (scripts, future endpoints) rather than only via that one route.
    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new BadRequestException('ไฟล์มีขนาดเกิน 5MB');
    }

    const detected = MAGIC_BYTES.find((candidate) => candidate.test(file.buffer));
    if (!detected) {
      throw new BadRequestException('รองรับเฉพาะไฟล์ JPG, PNG หรือ PDF เท่านั้น');
    }

    const tenantId = getCurrentTenantId();
    const storageKey = await this.storage.write(tenantId, `upload${detected.ext}`, file.buffer);

    // originalFilename is shown back to the user, so it is truncated and
    // stripped of path separators — it never reaches the filesystem (see
    // AttachmentStorageService.write), but it does reach HR's browser.
    const originalFilename = (file.originalname ?? 'attachment').replace(/[/\\]/g, '_').slice(0, 200);

    const attachment = await this.prisma.leaveAttachment.create({
      data: {
        // Redundant at runtime — the tenant-scoping extension injects the
        // same value — but Prisma's generated create input requires it, and
        // the other services state it explicitly for the same reason.
        tenantId,
        uploadedByEmployeeId: uploaderEmployeeId,
        storageKey,
        originalFilename,
        mimeType: detected.mime,
        sizeBytes: file.size,
      },
      select: { id: true, originalFilename: true, mimeType: true, sizeBytes: true },
    });

    return attachment;
  }

  /**
   * Resolves an attachment for download, after checking the caller is allowed
   * to see it. Medical certificates are health data: the default is no.
   */
  async download(attachmentId: string, user: AuthenticatedUser): Promise<{ stream: ReadStream; filename: string; mimeType: string; sizeBytes: number }> {
    // Tenant scoping is injected by the Prisma extension (NFR-1), so an id
    // belonging to another customer is simply not found here.
    const attachment = await this.prisma.leaveAttachment.findFirst({ where: { id: attachmentId } });
    if (!attachment) throw new NotFoundException('ไม่พบไฟล์แนบ');

    if (!(await this.canRead(attachment.id, attachment.uploadedByEmployeeId, user))) {
      throw new ForbiddenException('คุณไม่มีสิทธิ์เข้าถึงไฟล์แนบนี้');
    }

    return {
      stream: this.storage.read(attachment.storageKey),
      filename: attachment.originalFilename,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
    };
  }

  /**
   * Deletes attachments uploaded before `cutoff` that no leave request ever
   * referenced. Called per tenant by SchedulerService — see the doc comment
   * there for why this exists.
   *
   * The set of "still referenced" ids has to be built by decrypting every
   * request's `attachment_url_enc`, since the ciphertext is not searchable
   * (AES-GCM uses a fresh IV per value, so the same id encrypts differently
   * every time and no `WHERE attachment_url_enc = ?` is possible). That is
   * the accepted cost of NFR-2 on this column; the scan is bounded to one
   * tenant's requests that actually have an attachment.
   */
  async pruneOrphaned(cutoff: Date): Promise<number> {
    const candidates = await this.prisma.leaveAttachment.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true, storageKey: true },
    });
    if (candidates.length === 0) return 0;

    const referenced = new Set(
      (await this.prisma.leaveRequest.findMany({ where: { attachmentUrlEnc: { not: null } }, select: { attachmentUrlEnc: true } }))
        .map((request) => this.safeDecrypt(request.attachmentUrlEnc!))
        .filter((id): id is string => id !== null),
    );

    const orphans = candidates.filter((candidate) => !referenced.has(candidate.id));
    if (orphans.length === 0) return 0;

    // Bytes first, then the row: if the process dies between the two, the
    // next run simply re-attempts a delete of an already-missing file (a
    // no-op in AttachmentStorageService.remove). The reverse order would
    // leave a file on disk with nothing left pointing at it — undeletable
    // health data, which is the outcome this job exists to prevent.
    for (const orphan of orphans) {
      await this.storage.remove(orphan.storageKey);
    }
    await this.prisma.leaveAttachment.deleteMany({ where: { id: { in: orphans.map((orphan) => orphan.id) } } });

    return orphans.length;
  }

  private async canRead(attachmentId: string, uploadedByEmployeeId: string, user: AuthenticatedUser): Promise<boolean> {
    if (user.id === uploadedByEmployeeId) return true;
    // HR sees every request in the company, so it sees every certificate.
    if (user.role === 'tenant_admin') return true;
    if (user.role !== 'approver') return false;

    // An approver may read a certificate only for a request that is actually
    // routed through them — being an approver for someone else's team is not
    // a licence to read the whole company's medical records. The check is
    // against the request's frozen workflow snapshot rather than the live
    // workflow config, matching how approval authority itself is decided
    // everywhere else (LeaveRequestsService.act).
    const requests = await this.prisma.leaveRequest.findMany({
      where: { employeeId: uploadedByEmployeeId, attachmentUrlEnc: { not: null } },
      select: { attachmentUrlEnc: true, workflowSnapshot: true },
    });

    return requests.some((request) => {
      if (!request.attachmentUrlEnc || this.safeDecrypt(request.attachmentUrlEnc) !== attachmentId) return false;
      const snapshot = request.workflowSnapshot as unknown as WorkflowStepSnapshot[];
      return Array.isArray(snapshot) && snapshot.some((step) => step.approverEmployeeId === user.id);
    });
  }

  /**
   * Rows written before attachments were encrypted (or by a previous key)
   * fail to decrypt. That must read as "this row doesn't match" rather than
   * take down the whole permission check with a 500 — the caller is asking
   * "may I read attachment X", and an undecryptable row simply isn't X.
   */
  private safeDecrypt(value: string): string | null {
    try {
      return this.encryption.decrypt(value);
    } catch {
      return null;
    }
  }
}
