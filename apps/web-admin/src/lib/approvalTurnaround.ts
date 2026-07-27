import { apiFetch } from "./api";

export interface ApproverTurnaroundRow {
  approverId: string;
  fullName: string;
  decidedCount: number;
  approvedCount: number;
  rejectedCount: number;
  avgWaitHours: number | null;
  maxWaitHours: number | null;
  pendingCount: number;
  oldestPendingWaitHours: number | null;
}

export interface ApprovalTurnaroundFilters {
  startDate?: string;
  endDate?: string;
}

function toQueryString(filters: ApprovalTurnaroundFilters): string {
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

export async function fetchApprovalTurnaround(filters: ApprovalTurnaroundFilters): Promise<ApproverTurnaroundRow[]> {
  return unwrap(await apiFetch(`/reports/approval-turnaround${toQueryString(filters)}`));
}

export async function downloadApprovalTurnaroundCsv(filters: ApprovalTurnaroundFilters): Promise<void> {
  const res = await apiFetch(`/reports/approval-turnaround/export${toQueryString(filters)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Request failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "lala-approval-turnaround.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
