import { apiFetch, unwrap } from "./api";

export type DurationType = "full_day" | "half_am" | "half_pm" | "hourly";
export type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface LeaveType {
  id: string;
  name: string;
  defaultQuota: string;
  requiresAttachmentAfterDays: number | null;
  allowHourly: boolean;
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
  leaveTypeId: string;
  leaveType: { name: string };
  durationType: DurationType;
  startDatetime: string;
  endDatetime: string;
  totalDays: string;
  reason: string | null;
  isOverQuota: boolean;
  lwopAcknowledged: boolean;
  status: RequestStatus;
  currentStep: number;
  workflowSnapshot: { label: string; approverType: string; approverEmployeeId: string }[];
  approvalActions: ApprovalAction[];
  employee?: { id: string; fullName: string };
  createdAt: string;
}

export async function listLeaveTypes(): Promise<LeaveType[]> {
  return unwrap(await apiFetch("/leave-types"));
}

export async function listMyRequests(): Promise<LeaveRequest[]> {
  return unwrap(await apiFetch("/leave-requests/mine"));
}

export interface SubmitLeaveInput {
  leaveTypeId: string;
  durationType: DurationType;
  startDate: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  reason?: string;
  attachmentUrl?: string;
  lwopAcknowledged?: boolean;
}

export async function submitLeaveRequest(input: SubmitLeaveInput): Promise<LeaveRequest> {
  const res = await apiFetch("/leave-requests", { method: "POST", body: JSON.stringify(input) });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const msg = Array.isArray(body?.message) ? body.message.join(", ") : body?.message;
    throw new Error(msg ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export async function cancelLeaveRequest(id: string): Promise<void> {
  const res = await apiFetch(`/leave-requests/${id}/cancel`, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Request failed (${res.status})`);
  }
}
