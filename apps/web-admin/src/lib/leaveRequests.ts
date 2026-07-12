import { apiFetch } from "./api";

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export interface ApprovalAction {
  action: "approve" | "reject";
  comment: string | null;
  stepOrder: number;
  actedAt: string;
  approver: { fullName: string };
}

export interface LeaveRequest {
  id: string;
  leaveType: { name: string };
  durationType: string;
  startDatetime: string;
  endDatetime: string;
  totalDays: string;
  reason: string | null;
  isOverQuota: boolean;
  lwopAcknowledged: boolean;
  status: "pending" | "approved" | "rejected" | "cancelled";
  currentStep: number;
  workflowSnapshot: { label: string; approverType: string; approverEmployeeId: string }[];
  approvalActions: ApprovalAction[];
  employee: { id: string; fullName: string; departmentId: string | null };
  createdAt: string;
}

export async function listPendingForMe(): Promise<LeaveRequest[]> {
  return unwrap(await apiFetch("/leave-requests/pending-for-me"));
}

export async function approveLeaveRequest(id: string): Promise<LeaveRequest> {
  const res = await apiFetch(`/leave-requests/${id}/approve`, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export async function rejectLeaveRequest(id: string, comment: string): Promise<LeaveRequest> {
  const res = await apiFetch(`/leave-requests/${id}/reject`, { method: "POST", body: JSON.stringify({ comment }) });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const msg = Array.isArray(body?.message) ? body.message.join(", ") : body?.message;
    throw new Error(msg ?? `Request failed (${res.status})`);
  }
  return res.json();
}
