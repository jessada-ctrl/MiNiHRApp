import { InternalServerErrorException } from '@nestjs/common';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AttachmentStorageService } from './attachment-storage.service';

describe('AttachmentStorageService', () => {
  let root: string;
  let previousDir: string | undefined;
  let storage: AttachmentStorageService;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'lala-attachments-'));
    previousDir = process.env.ATTACHMENTS_DIR;
    process.env.ATTACHMENTS_DIR = root;
    // The root is read in the field initialiser, so the env var has to be set
    // before construction — not in a beforeAll.
    storage = new AttachmentStorageService();
    await storage.onModuleInit();
  });

  afterEach(async () => {
    if (previousDir === undefined) delete process.env.ATTACHMENTS_DIR;
    else process.env.ATTACHMENTS_DIR = previousDir;
    await rm(root, { recursive: true, force: true });
  });

  it('writes under a tenant-prefixed key so one customer\'s files never mix with another\'s', async () => {
    const key = await storage.write('tenant-a', 'cert.pdf', Buffer.from('hello'));
    expect(key.startsWith('tenant-a/')).toBe(true);
    await expect(readFile(join(root, key), 'utf8')).resolves.toBe('hello');
  });

  it('never reuses the uploader-supplied filename, only its extension', async () => {
    const key = await storage.write('tenant-a', 'my-medical-history.pdf', Buffer.from('x'));
    expect(key).not.toContain('my-medical-history');
    expect(key.endsWith('.pdf')).toBe(true);
  });

  it('gives two uploads of the same filename distinct keys', async () => {
    const [first, second] = await Promise.all([
      storage.write('tenant-a', 'cert.jpg', Buffer.from('1')),
      storage.write('tenant-a', 'cert.jpg', Buffer.from('2')),
    ]);
    expect(first).not.toBe(second);
  });

  // The keys handled here come from the DB, but a traversal escape would be
  // catastrophic (arbitrary file read via the download endpoint), so the
  // guard is asserted directly rather than assumed from the UUID naming.
  it.each(['../../../etc/passwd', 'tenant-a/../../escape.txt', '/etc/passwd', 'C:\\Windows\\win.ini'])(
    'refuses to resolve the key %p outside the storage root',
    (key) => {
      expect(() => storage.read(key)).toThrow(InternalServerErrorException);
    },
  );

  it('removes a stored file', async () => {
    const key = await storage.write('tenant-a', 'cert.jpg', Buffer.from('x'));
    await storage.remove(key);
    await expect(readFile(join(root, key))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  // pruneOrphaned deletes bytes before rows, so a re-run after a crash will
  // ask for a file that is already gone — that has to be a no-op, or the job
  // would wedge permanently on its own retry.
  it('treats removing an already-deleted file as success', async () => {
    const key = await storage.write('tenant-a', 'cert.jpg', Buffer.from('x'));
    await storage.remove(key);
    await expect(storage.remove(key)).resolves.toBeUndefined();
  });

  it('reads back exactly what was written', async () => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const key = await storage.write('tenant-b', 'cert.jpg', bytes);
    const chunks: Buffer[] = [];
    for await (const chunk of storage.read(key)) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks)).toEqual(bytes);
  });

  it('does not read a file that exists outside the root even if one is planted there', async () => {
    const outside = join(tmpdir(), `lala-outside-${process.pid}.txt`);
    await writeFile(outside, 'secret');
    try {
      expect(() => storage.read(`../${join('..', outside)}`)).toThrow(InternalServerErrorException);
    } finally {
      await rm(outside, { force: true });
    }
  });
});
