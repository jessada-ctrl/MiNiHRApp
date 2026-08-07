import { apiFetch, unwrap } from "./api";

/** Mirrors FR-2.2 and the server-side limit in AttachmentsService. */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_ATTACHMENT_TYPES = "image/jpeg,image/png,application/pdf";

export interface UploadedAttachment {
  id: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Uploads a medical certificate and returns the id to pass as
 * `attachmentId` when submitting the leave request.
 *
 * The client-side size/type checks below exist only to fail fast on a phone
 * connection rather than after a 5MB round trip — the server re-checks both,
 * and sniffs the file's real type from its magic bytes rather than trusting
 * anything sent from here.
 */
export async function uploadAttachment(file: File): Promise<UploadedAttachment> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error("ไฟล์มีขนาดเกิน 5MB");
  }
  if (!ACCEPTED_ATTACHMENT_TYPES.split(",").includes(file.type)) {
    throw new Error("รองรับเฉพาะไฟล์ JPG, PNG หรือ PDF เท่านั้น");
  }

  const body = new FormData();
  body.append("file", file);
  return unwrap<UploadedAttachment>(await apiFetch("/attachments", { method: "POST", body }));
}

/**
 * Opens a certificate in a new tab.
 *
 * Fetched into a blob rather than linked directly, because the download
 * endpoint is behind the JWT and a plain <a href> sends no Authorization
 * header. The object URL is revoked shortly after — long enough for the new
 * tab to have loaded it, short enough not to pin the file in memory for the
 * rest of the session.
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
