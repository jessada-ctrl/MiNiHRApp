import { apiFetch } from "./api";

export interface ReportRow {
  id: string;
  totalDays: string;
  startDatetime: string;
  endDatetime: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  isOverQuota: boolean;
  employee: { fullName: string; employeeCode: string; department: { departmentName: string } | null };
  leaveType: { name: string };
}

export interface ReportFilters {
  status?: string;
  leaveTypeId?: string;
  startDate?: string;
  endDate?: string;
}

function toQueryString(filters: ReportFilters): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v) params.set(k, v);
  });
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function fetchLeaveReport(filters: ReportFilters): Promise<ReportRow[]> {
  const res = await apiFetch(`/reports/leave-requests${toQueryString(filters)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export async function downloadLeaveReportCsv(filters: ReportFilters): Promise<void> {
  const res = await apiFetch(`/reports/leave-requests/export${toQueryString(filters)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Request failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "lala-leave-report.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
