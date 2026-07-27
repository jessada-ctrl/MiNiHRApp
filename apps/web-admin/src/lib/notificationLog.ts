import { apiFetch } from "./api";

export interface NotificationLogRow {
  id: string;
  recipientLineUserId: string;
  messageType: string;
  relatedRequestId: string | null;
  sentAt: string;
  status: "sent" | "failed";
  recipientFullName: string | null;
}

export interface NotificationLogReport {
  rows: NotificationLogRow[];
  truncated: boolean;
}

export interface NotificationLogFilters {
  messageType?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

function toQueryString(filters: NotificationLogFilters): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v) params.set(k, v);
  });
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export async function fetchNotificationLog(filters: NotificationLogFilters): Promise<NotificationLogReport> {
  return unwrap(await apiFetch(`/reports/notification-log${toQueryString(filters)}`));
}

export async function downloadNotificationLogCsv(filters: NotificationLogFilters): Promise<void> {
  const res = await apiFetch(`/reports/notification-log/export${toQueryString(filters)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Request failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "lala-notification-log.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
