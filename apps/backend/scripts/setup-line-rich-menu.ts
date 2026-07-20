/**
 * One-time (rerunnable) setup for FR-2.1: creates the "unregistered"/
 * "registered" Rich Menus, uploads their images, sets "unregistered" as the
 * channel-wide default, and saves everything onto the Tenant row.
 *
 * Usage: ts-node --project prisma/tsconfig.seed.json scripts/setup-line-rich-menu.ts <tenantId> <liffId>
 *
 * The LIFF app itself is NOT created here — LINE's LIFF Server API
 * (`POST /liff/v1/apps`) rejects channels whose "Application Types" don't
 * already include LIFF, and that flag can only be set by adding the first
 * LIFF app through the Console UI once (LINE Developers Console -> your
 * channel -> LIFF tab -> Add). Create it there, copy the LIFF ID it gives
 * you, and pass it here — if its Endpoint URL ever needs to change (e.g.
 * the ngrok URL rotated), edit it in that same Console tab.
 *
 * Rerunning replaces both rich menus (deletes the old ones first) rather
 * than accumulating duplicates.
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const LINE_API = 'https://api.line.me';
const LINE_API_DATA = 'https://api-data.line.me';

interface RichMenuArea {
  bounds: { x: number; y: number; width: number; height: number };
  action: Record<string, unknown>;
}

function authHeaders(accessToken: string, extra: Record<string, string> = {}) {
  return { Authorization: `Bearer ${accessToken}`, ...extra };
}

async function deleteRichMenuIfExists(accessToken: string, richMenuId: string | null) {
  if (!richMenuId) return;
  const res = await fetch(`${LINE_API}/v2/bot/richmenu/${richMenuId}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
  // 404 is fine — already gone (e.g. manually deleted in LINE console).
  if (!res.ok && res.status !== 404) {
    console.warn(`Could not delete previous rich menu ${richMenuId}: ${res.status} ${await res.text()}`);
  }
}

async function createRichMenu(accessToken: string, name: string, chatBarText: string, areas: RichMenuArea[]): Promise<string> {
  const res = await fetch(`${LINE_API}/v2/bot/richmenu`, {
    method: 'POST',
    headers: authHeaders(accessToken, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ size: { width: 2500, height: 1686 }, selected: false, name, chatBarText, areas }),
  });
  if (!res.ok) throw new Error(`Create rich menu "${name}" failed: ${res.status} ${await res.text()}`);
  const { richMenuId } = (await res.json()) as { richMenuId: string };
  return richMenuId;
}

async function uploadRichMenuImage(accessToken: string, richMenuId: string, imagePath: string) {
  const image = fs.readFileSync(imagePath);
  const res = await fetch(`${LINE_API_DATA}/v2/bot/richmenu/${richMenuId}/content`, {
    method: 'POST',
    headers: authHeaders(accessToken, { 'Content-Type': 'image/png' }),
    body: image,
  });
  if (!res.ok) throw new Error(`Upload image for rich menu ${richMenuId} failed: ${res.status} ${await res.text()}`);
}

async function setDefaultRichMenu(accessToken: string, richMenuId: string) {
  const res = await fetch(`${LINE_API}/v2/bot/user/all/richmenu/${richMenuId}`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
  if (!res.ok) throw new Error(`Set default rich menu failed: ${res.status} ${await res.text()}`);
}

async function main() {
  const [, , tenantId, liffId] = process.argv;
  if (!tenantId || !liffId) {
    console.error('Usage: setup-line-rich-menu.ts <tenantId> <liffId e.g. 1234567890-abcdEFGh>');
    process.exit(1);
  }

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const accessToken = tenant.lineChannelAccessTokenEnc;
  if (!accessToken) throw new Error('Tenant has no lineChannelAccessTokenEnc configured — set it via the /settings page first');

  const liffUrl = `https://liff.line.me/${liffId}`;

  await deleteRichMenuIfExists(accessToken, tenant.lineRichMenuUnregisteredId);
  await deleteRichMenuIfExists(accessToken, tenant.lineRichMenuRegisteredId);

  const assetsDir = path.join(__dirname, 'assets');

  console.log('Creating "unregistered" rich menu...');
  const unregisteredId = await createRichMenu(accessToken, 'unregistered', 'เมนู', [
    { bounds: { x: 0, y: 0, width: 2500, height: 1686 }, action: { type: 'uri', label: 'ลงทะเบียน', uri: liffUrl } },
  ]);
  await uploadRichMenuImage(accessToken, unregisteredId, path.join(assetsDir, 'richmenu-unregistered.png'));

  console.log('Creating "registered" rich menu...');
  const registeredId = await createRichMenu(accessToken, 'registered', 'เมนู', [
    { bounds: { x: 0, y: 0, width: 2500, height: 1686 }, action: { type: 'message', label: 'ถามคำถาม HR', text: 'สวัสดี' } },
  ]);
  await uploadRichMenuImage(accessToken, registeredId, path.join(assetsDir, 'richmenu-registered.png'));

  console.log('Setting "unregistered" menu as the channel-wide default...');
  await setDefaultRichMenu(accessToken, unregisteredId);

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { lineLiffId: liffId, lineRichMenuUnregisteredId: unregisteredId, lineRichMenuRegisteredId: registeredId },
  });

  console.log('Done.');
  console.log(`liffId: ${liffId} (liff URL: ${liffUrl})`);
  console.log(`unregistered richMenuId: ${unregisteredId}`);
  console.log(`registered richMenuId: ${registeredId}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
