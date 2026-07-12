import { apiFetch } from "./api";

export type ScopeType = "department" | "branch" | "leave_type" | "global";
export type ApproverType = "specific_employee" | "direct_manager";

export interface WorkflowStep {
  id: string;
  stepOrder: number;
  approverType: ApproverType;
  approverEmployeeId: string | null;
  approverEmployee: { id: string; fullName: string } | null;
}

export interface Workflow {
  id: string;
  name: string;
  scopeType: ScopeType;
  scopeId: string | null;
  steps: WorkflowStep[];
}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export async function listWorkflows(): Promise<Workflow[]> {
  return unwrap(await apiFetch("/approval-workflows"));
}

export interface StepInput {
  approverType: ApproverType;
  approverEmployeeId?: string;
}

export async function createWorkflow(input: {
  name: string;
  scopeType: ScopeType;
  steps: StepInput[];
}): Promise<Workflow> {
  return unwrap(await apiFetch("/approval-workflows", { method: "POST", body: JSON.stringify(input) }));
}

export async function updateWorkflowSteps(id: string, steps: StepInput[]): Promise<WorkflowStep[]> {
  return unwrap(
    await apiFetch(`/approval-workflows/${id}/steps`, { method: "PATCH", body: JSON.stringify({ steps }) }),
  );
}

export async function deleteWorkflow(id: string): Promise<void> {
  const res = await apiFetch(`/approval-workflows/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Request failed (${res.status})`);
  }
}
