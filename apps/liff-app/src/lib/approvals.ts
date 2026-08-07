import { apiFetch, unwrap } from "./api";

export interface ApprovalAction {
  action: "approve" | "reject";
  comment: string | null;
  stepOrder: number;
  actedAt: string;
  approver: { fullName: string };
}

export interface PendingApproval {
  id: string;
  leaveType: { name: string };
  durationType: string;
  startDatetime: string;
  endDatetime: string;
  totalDays: string;
  reason: string | null;
  isOverQuota: boolean;
  status: "pending" | "approved" | "rejected" | "cancelled";
  currentStep: number;
  workflowSnapshot: { label: string; approverType: string; approverEmployeeId: string }[];
  approvalActions: ApprovalAction[];
  employee: { id: string; fullName: string; departmentId: string | null };
  /** Null unless a medical certificate was attached — open it via openAttachment(). */
  attachmentId: string | null;
}

export async function listPendingForMe(): Promise<PendingApproval[]> {
  return unwrap(await apiFetch("/leave-requests/pending-for-me"));
}

export async function approveLeaveRequest(id: string): Promise<PendingApproval> {
  return unwrap(await apiFetch(`/leave-requests/${id}/approve`, { method: "POST" }));
}

export async function rejectLeaveRequest(id: string, comment: string): Promise<PendingApproval> {
  return unwrap(await apiFetch(`/leave-requests/${id}/reject`, { method: "POST", body: JSON.stringify({ comment }) }));
}
