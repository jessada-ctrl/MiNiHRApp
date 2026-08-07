import { apiFetch } from "./api";

/**
 * Opens a leave request's medical certificate in a new tab.
 *
 * Fetched into a blob rather than linked directly, because the download
 * endpoint is behind the JWT and a plain <a href> sends no Authorization
 * header. The object URL is revoked shortly after — long enough for the new
 * tab to have loaded it, short enough not to pin health data in memory for
 * the rest of the session.
 */
export async function openAttachment(attachmentId: string): Promise<void> {
  const res = await apiFetch(`/attachments/${attachmentId}`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? "เปิดไฟล์แนบไม่สำเร็จ");
  }
  const url = URL.createObjectURL(await res.blob());
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
