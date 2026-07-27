import { apiFetch } from "./api";

export interface QuotaUtilizationRow {
  departmentId: string | null;
  departmentName: string;
  leaveTypeId: string;
  leaveTypeName: string;
  employeeCount: number;
  totalQuota: number;
  used: number;
  pending: number;
  remaining: number;
  utilizationPct: number;
}

export interface QuotaUtilizationFilters {
  year?: string;
  departmentId?: string;
  branchId?: string;
  leaveTypeId?: string;
}

function toQueryString(filters: QuotaUtilizationFilters): string {
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

export async function fetchQuotaUtilization(filters: QuotaUtilizationFilters): Promise<QuotaUtilizationRow[]> {
  return unwrap(await apiFetch(`/reports/quota-utilization${toQueryString(filters)}`));
}

export async function downloadQuotaUtilizationCsv(filters: QuotaUtilizationFilters): Promise<void> {
  const res = await apiFetch(`/reports/quota-utilization/export${toQueryString(filters)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Request failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "lala-quota-utilization.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
