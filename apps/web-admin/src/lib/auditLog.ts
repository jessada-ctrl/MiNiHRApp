import { apiFetch } from "./api";

export interface AuditLogRow {
  id: string;
  userId: string;
  action: string;
  targetTable: string;
  targetId: string | null;
  ipAddress: string;
  timestamp: string;
  actorFullName: string | null;
  actorEmail: string | null;
}

export interface AuditLogReport {
  rows: AuditLogRow[];
  truncated: boolean;
}

export interface AuditLogFilters {
  targetTable?: string;
  action?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
}

function toQueryString(filters: AuditLogFilters): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v) params.set(k, v);
  });
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function fetchAuditLog(filters: AuditLogFilters): Promise<AuditLogReport> {
  const res = await apiFetch(`/reports/audit-log${toQueryString(filters)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export async function downloadAuditLogCsv(filters: AuditLogFilters): Promise<void> {
  const res = await apiFetch(`/reports/audit-log/export${toQueryString(filters)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Request failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "lala-audit-log.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
