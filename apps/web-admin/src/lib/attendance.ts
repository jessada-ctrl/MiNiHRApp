import { apiFetch } from "./api";

export interface DailyQrCode {
  qrToken: string;
  validDate: string;
}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export async function getTodayQrCode(branchId: string): Promise<DailyQrCode | null> {
  return unwrap(await apiFetch(`/attendance/qr-codes/${branchId}`));
}

export async function generateQrCode(branchId: string): Promise<DailyQrCode> {
  return unwrap(await apiFetch(`/attendance/qr-codes/${branchId}/generate`, { method: "POST" }));
}
