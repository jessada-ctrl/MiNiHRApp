import { apiFetch } from "./api";

export interface LeaveType {
  id: string;
  name: string;
  defaultQuota: string; // Prisma Decimal serializes as a numeric string
  requiresAttachmentAfterDays: number | null;
  allowHourly: boolean;
  isPaid: boolean;
}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export async function listLeaveTypes(): Promise<LeaveType[]> {
  return unwrap(await apiFetch("/leave-types"));
}

export interface LeaveTypeInput {
  name: string;
  defaultQuota: number;
  requiresAttachmentAfterDays?: number | null;
  allowHourly?: boolean;
}

export async function createLeaveType(input: LeaveTypeInput): Promise<LeaveType> {
  return unwrap(await apiFetch("/leave-types", { method: "POST", body: JSON.stringify(input) }));
}

export async function updateLeaveType(id: string, input: Partial<LeaveTypeInput>): Promise<LeaveType> {
  return unwrap(await apiFetch(`/leave-types/${id}`, { method: "PATCH", body: JSON.stringify(input) }));
}

export async function deleteLeaveType(id: string): Promise<void> {
  const res = await apiFetch(`/leave-types/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Request failed (${res.status})`);
  }
}
