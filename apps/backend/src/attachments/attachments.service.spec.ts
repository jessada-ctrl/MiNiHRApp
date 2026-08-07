import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EncryptionService } from '../crypto/encryption.service';
import { tenantContext } from '../tenant/tenant-context';
import type { AuthenticatedUser } from '../auth/jwt-payload.interface';
import { AttachmentStorageService } from './attachment-storage.service';
import { AttachmentsService, MAX_ATTACHMENT_BYTES } from './attachments.service';

const TENANT_ID = 'tenant-a';

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n', 'latin1'), Buffer.alloc(64)]);
const HTML = Buffer.from('<html><script>alert(1)</script></html>', 'utf8');

function multerFile(buffer: Buffer, overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'cert.jpg',
    encoding: '7bit',
    mimetype: 'image/jpeg',
    size: buffer.length,
    buffer,
    // AttachmentsService never touches the stream — it works from `buffer`,
    // because the file has to be inspected before it goes anywhere.
    stream: undefined as never,
    destination: '',
    filename: '',
    path: '',
    ...overrides,
  };
}

function user(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'employee-1',
    tenantId: TENANT_ID,
    role: 'employee',
    email: 'e1@example.com',
    fullName: 'Employee One',
    mustChangePassword: false,
    ...overrides,
  };
}

/** Real cipher (dev key), so encrypt/decrypt round-trips behave as in production. */
function realEncryption(): EncryptionService {
  return new EncryptionService({ get: () => undefined } as never);
}

describe('AttachmentsService', () => {
  let prisma: {
    leaveAttachment: { create: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock; deleteMany: jest.Mock };
    leaveRequest: { findMany: jest.Mock };
  };
  let storage: { write: jest.Mock; read: jest.Mock; remove: jest.Mock };
  let encryption: EncryptionService;
  let service: AttachmentsService;

  beforeEach(() => {
    prisma = {
      leaveAttachment: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), deleteMany: jest.fn() },
      leaveRequest: { findMany: jest.fn().mockResolvedValue([]) },
    };
    storage = { write: jest.fn().mockResolvedValue('tenant-a/uuid.jpg'), read: jest.fn(), remove: jest.fn() };
    encryption = realEncryption();
    service = new AttachmentsService(prisma as never, storage as unknown as AttachmentStorageService, encryption);
    prisma.leaveAttachment.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'attachment-1', ...data }),
    );
  });

  function upload(file: Express.Multer.File, uploaderId = 'employee-1') {
    return tenantContext.run({ tenantId: TENANT_ID }, () => service.upload(file, uploaderId));
  }

  /**
   * `expect.objectContaining` is typed `any`, so nesting one inside another
   * trips no-unsafe-assignment at every call site. Named once here instead.
   */
  function expectCreatedWith(fields: Record<string, unknown>) {
    expect(prisma.leaveAttachment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining(fields) as object }),
    );
  }

  describe('upload validation (FR-2.2)', () => {
    const REAL_FILES: [label: string, bytes: Buffer, expectedMime: string][] = [
      ['JPEG', JPEG, 'image/jpeg'],
      ['PNG', PNG, 'image/png'],
      ['PDF', PDF, 'application/pdf'],
    ];

    it.each(REAL_FILES)('accepts a real %s and records the sniffed type', async (_label, bytes, expectedMime) => {
      await upload(multerFile(bytes));
      expectCreatedWith({ mimeType: expectedMime });
    });

    // The whole point of sniffing: a client can claim any mimetype it likes.
    it('rejects a file whose content is not JPG/PNG/PDF even when the client claims image/jpeg', async () => {
      await expect(upload(multerFile(HTML, { mimetype: 'image/jpeg', originalname: 'cert.jpg' }))).rejects.toBeInstanceOf(BadRequestException);
      expect(storage.write).not.toHaveBeenCalled();
    });

    it('records the sniffed type rather than the one the client sent', async () => {
      await upload(multerFile(PDF, { mimetype: 'image/png' }));
      expectCreatedWith({ mimeType: 'application/pdf' });
    });

    it('rejects a file over 5MB', async () => {
      await expect(upload(multerFile(JPEG, { size: MAX_ATTACHMENT_BYTES + 1 }))).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an empty upload', async () => {
      await expect(upload(multerFile(Buffer.alloc(0)))).rejects.toBeInstanceOf(BadRequestException);
    });

    it('strips path separators from the filename it stores for display', async () => {
      await upload(multerFile(JPEG, { originalname: '../../etc/passwd.jpg' }));
      expectCreatedWith({ originalFilename: '.._.._etc_passwd.jpg' });
    });
  });

  describe('download authorization', () => {
    const attachment = { id: 'attachment-1', uploadedByEmployeeId: 'employee-1', storageKey: 'tenant-a/x.jpg', originalFilename: 'cert.jpg', mimeType: 'image/jpeg', sizeBytes: 100 };

    function download(as: AuthenticatedUser) {
      return tenantContext.run({ tenantId: TENANT_ID }, () => service.download('attachment-1', as));
    }

    it('404s when the id does not resolve in the caller\'s tenant', async () => {
      prisma.leaveAttachment.findFirst.mockResolvedValue(null);
      await expect(download(user({ role: 'tenant_admin' }))).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lets the employee who uploaded it read it back', async () => {
      prisma.leaveAttachment.findFirst.mockResolvedValue(attachment);
      await expect(download(user({ id: 'employee-1' }))).resolves.toEqual(expect.objectContaining({ filename: 'cert.jpg' }));
    });

    it('lets HR read any certificate in the company', async () => {
      prisma.leaveAttachment.findFirst.mockResolvedValue(attachment);
      await expect(download(user({ id: 'hr-1', role: 'tenant_admin' }))).resolves.toBeDefined();
    });

    it('denies an unrelated colleague', async () => {
      prisma.leaveAttachment.findFirst.mockResolvedValue(attachment);
      await expect(download(user({ id: 'employee-2' }))).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lets an approver on the request read it', async () => {
      prisma.leaveAttachment.findFirst.mockResolvedValue(attachment);
      prisma.leaveRequest.findMany.mockResolvedValue([
        { attachmentUrlEnc: encryption.encrypt('attachment-1'), workflowSnapshot: [{ approverEmployeeId: 'boss-1' }] },
      ]);
      await expect(download(user({ id: 'boss-1', role: 'approver' }))).resolves.toBeDefined();
    });

    // Being an approver somewhere in the company is not a licence to read
    // every employee's medical records.
    it('denies an approver who is not on this employee\'s workflow', async () => {
      prisma.leaveAttachment.findFirst.mockResolvedValue(attachment);
      prisma.leaveRequest.findMany.mockResolvedValue([
        { attachmentUrlEnc: encryption.encrypt('attachment-1'), workflowSnapshot: [{ approverEmployeeId: 'boss-1' }] },
      ]);
      await expect(download(user({ id: 'boss-2', role: 'approver' }))).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('denies an approver when the request referencing the attachment is a different one', async () => {
      prisma.leaveAttachment.findFirst.mockResolvedValue(attachment);
      prisma.leaveRequest.findMany.mockResolvedValue([
        { attachmentUrlEnc: encryption.encrypt('some-other-attachment'), workflowSnapshot: [{ approverEmployeeId: 'boss-1' }] },
      ]);
      await expect(download(user({ id: 'boss-1', role: 'approver' }))).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('treats an undecryptable reference as no match rather than failing the request', async () => {
      prisma.leaveAttachment.findFirst.mockResolvedValue(attachment);
      prisma.leaveRequest.findMany.mockResolvedValue([
        { attachmentUrlEnc: 'not-valid-ciphertext', workflowSnapshot: [{ approverEmployeeId: 'boss-1' }] },
      ]);
      await expect(download(user({ id: 'boss-1', role: 'approver' }))).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('pruneOrphaned', () => {
    it('deletes the bytes before the row, and only for unreferenced uploads', async () => {
      prisma.leaveAttachment.findMany.mockResolvedValue([
        { id: 'used', storageKey: 'tenant-a/used.jpg' },
        { id: 'orphan', storageKey: 'tenant-a/orphan.jpg' },
      ]);
      prisma.leaveRequest.findMany.mockResolvedValue([{ attachmentUrlEnc: encryption.encrypt('used') }]);

      const removed = await tenantContext.run({ tenantId: TENANT_ID }, () => service.pruneOrphaned(new Date()));

      expect(removed).toBe(1);
      expect(storage.remove).toHaveBeenCalledTimes(1);
      expect(storage.remove).toHaveBeenCalledWith('tenant-a/orphan.jpg');
      expect(prisma.leaveAttachment.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['orphan'] } } });
    });

    it('does nothing when every upload is referenced', async () => {
      prisma.leaveAttachment.findMany.mockResolvedValue([{ id: 'used', storageKey: 'tenant-a/used.jpg' }]);
      prisma.leaveRequest.findMany.mockResolvedValue([{ attachmentUrlEnc: encryption.encrypt('used') }]);

      await expect(tenantContext.run({ tenantId: TENANT_ID }, () => service.pruneOrphaned(new Date()))).resolves.toBe(0);
      expect(storage.remove).not.toHaveBeenCalled();
      expect(prisma.leaveAttachment.deleteMany).not.toHaveBeenCalled();
    });
  });
});
