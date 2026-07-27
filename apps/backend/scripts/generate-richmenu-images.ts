/**
 * Generates the two Rich Menu background images LINE requires (2500x1686 PNG)
 * for FR-2.1/FR-3.2's "unregistered" and "registered" menus — replaces the
 * earlier PowerShell/System.Drawing placeholder generator with proper
 * rounded shapes + gradients via @napi-rs/canvas (prebuilt binary, no native
 * build step). Icons are hand-drawn flat glyphs, not emoji — emoji glyph
 * rendering through canvas depends on whatever font the OS falls back to,
 * which isn't reliable across machines.
 *
 * Colors match the LaLa' brand icon (sky blue -> amber, sampled from
 * apps/liff-app/src/assets/logo-icon.png) — darker stops than the ones used
 * in the web UI so white icon/text overlays stay legible at Rich Menu size.
 *
 * Usage: ts-node --project prisma/tsconfig.seed.json scripts/generate-richmenu-images.ts
 */
import { createCanvas, loadImage, SKRSContext2D } from '@napi-rs/canvas';
import * as fs from 'fs';
import * as path from 'path';

const WIDTH = 2500;
const HEIGHT = 1686;

const SKY = '#0284c7';
const AMBER = '#d97706';
const WHITE = '#ffffff';
const LOGO_PATH = path.join(__dirname, '../../liff-app/src/assets/logo-icon.png');

function paintBackground(ctx: SKRSContext2D) {
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, SKY);
  gradient.addColorStop(1, AMBER);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

async function paintLogo(ctx: SKRSContext2D, cx: number, cy: number, size: number) {
  const logo = await loadImage(LOGO_PATH);
  ctx.save();
  ctx.beginPath();
  const r = size * 0.22;
  ctx.moveTo(cx - size / 2 + r, cy - size / 2);
  ctx.arcTo(cx + size / 2, cy - size / 2, cx + size / 2, cy + size / 2, r);
  ctx.arcTo(cx + size / 2, cy + size / 2, cx - size / 2, cy + size / 2, r);
  ctx.arcTo(cx - size / 2, cy + size / 2, cx - size / 2, cy - size / 2, r);
  ctx.arcTo(cx - size / 2, cy - size / 2, cx + size / 2, cy - size / 2, r);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(logo, cx - size / 2, cy - size / 2, size, size);
  ctx.restore();
}

function iconBadge(ctx: SKRSContext2D, cx: number, cy: number, radius: number, draw: (ctx: SKRSContext2D) => void) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.fill();

  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.translate(cx, cy);
  draw(ctx);
  ctx.restore();
}

function drawDocumentIcon(ctx: SKRSContext2D) {
  // Document with a pencil stroke across it — "ขอลา" (request leave).
  ctx.strokeRect(-55, -80, 110, 150);
  ctx.beginPath();
  ctx.moveTo(-30, -40);
  ctx.lineTo(30, -40);
  ctx.moveTo(-30, 0);
  ctx.lineTo(30, 0);
  ctx.moveTo(-30, 40);
  ctx.lineTo(10, 40);
  ctx.stroke();
}

function drawClockIcon(ctx: SKRSContext2D) {
  // Clock face with hands — "ประวัติการลา" (leave history).
  ctx.beginPath();
  ctx.arc(0, 0, 85, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -50);
  ctx.moveTo(0, 0);
  ctx.lineTo(35, 20);
  ctx.stroke();
}

function drawChatIcon(ctx: SKRSContext2D) {
  // Rounded chat bubble with a tail — "ถาม HR" (ask HR chatbot).
  const w = 150;
  const h = 100;
  const r = 24;
  ctx.beginPath();
  ctx.moveTo(-w / 2 + r, -h / 2);
  ctx.lineTo(w / 2 - r, -h / 2);
  ctx.arcTo(w / 2, -h / 2, w / 2, -h / 2 + r, r);
  ctx.lineTo(w / 2, h / 2 - r);
  ctx.arcTo(w / 2, h / 2, w / 2 - r, h / 2, r);
  ctx.lineTo(-15, h / 2);
  ctx.lineTo(-30, h / 2 + 35);
  ctx.lineTo(-25, h / 2);
  ctx.lineTo(-w / 2 + r, h / 2);
  ctx.arcTo(-w / 2, h / 2, -w / 2, h / 2 - r, r);
  ctx.lineTo(-w / 2, -h / 2 + r);
  ctx.arcTo(-w / 2, -h / 2, -w / 2 + r, -h / 2, r);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-45, -8);
  ctx.lineTo(45, -8);
  ctx.moveTo(-45, 18);
  ctx.lineTo(15, 18);
  ctx.stroke();
}

function centeredText(ctx: SKRSContext2D, text: string, x: number, y: number, size: number, weight: 'bold' | 'normal' = 'bold') {
  ctx.font = `${weight} ${size}px "Leelawadee UI", "Segoe UI", sans-serif`;
  ctx.fillStyle = WHITE;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

async function generateUnregistered(): Promise<Buffer> {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  paintBackground(ctx);
  await paintLogo(ctx, WIDTH / 2, 145, 150);

  iconBadge(ctx, WIDTH / 2, HEIGHT / 2 - 220, 130, (c) => {
    c.beginPath();
    c.arc(0, -25, 45, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.moveTo(-65, 60);
    c.quadraticCurveTo(0, -10, 65, 60);
    c.stroke();
  });

  centeredText(ctx, 'ลงทะเบียนเข้าใช้งาน', WIDTH / 2, HEIGHT / 2 + 40, 130);
  centeredText(ctx, 'แตะเพื่อเริ่มต้นผูกบัญชี LINE กับ HR', WIDTH / 2, HEIGHT / 2 + 155, 60, 'normal');

  return canvas.toBuffer('image/png');
}

async function generateRegistered(): Promise<Buffer> {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  paintBackground(ctx);
  await paintLogo(ctx, WIDTH / 2, 100, 110);

  const columns: { label: string; draw: (ctx: SKRSContext2D) => void }[] = [
    { label: 'ขอลา', draw: drawDocumentIcon },
    { label: 'ประวัติการลา', draw: drawClockIcon },
    { label: 'ถาม HR', draw: drawChatIcon },
  ];

  const colWidth = WIDTH / columns.length;

  // Thin separators between columns.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.lineWidth = 3;
  for (let i = 1; i < columns.length; i++) {
    const x = colWidth * i;
    ctx.beginPath();
    ctx.moveTo(x, 180);
    ctx.lineTo(x, HEIGHT - 180);
    ctx.stroke();
  }

  columns.forEach((col, i) => {
    const cx = colWidth * i + colWidth / 2;
    iconBadge(ctx, cx, HEIGHT / 2 - 90, 140, col.draw);
    centeredText(ctx, col.label, cx, HEIGHT / 2 + 160, 78);
  });

  return canvas.toBuffer('image/png');
}

async function main() {
  const dir = path.join(__dirname, 'assets');
  fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(path.join(dir, 'richmenu-unregistered.png'), await generateUnregistered());
  fs.writeFileSync(path.join(dir, 'richmenu-registered.png'), await generateRegistered());

  console.log(`Generated richmenu-unregistered.png and richmenu-registered.png in ${dir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
