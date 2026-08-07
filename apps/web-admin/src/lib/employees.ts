import { apiFetch } from "./api";

export type Role = "employee" | "approver" | "tenant_admin";
export type Status = "active" | "inactive";

export interface Employee {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string;
  phone: string | null;
  position: string | null;
  role: Role;
  status: Status;
  departmentId: string | null;
  branchId: string | null;
  directManagerId: string | null;
  department: { id: string; departmentName: string } | null;
  branch: { id: string; branchName: string } | null;
  directManager: { id: string; fullName: string } | null;
}

export interface Department {
  id: string;
  departmentName: string;
}

export interface Branch {
  id: string;
  branchName: string;
}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export async function listEmployees(): Promise<Employee[]> {
  return unwrap(await apiFetch("/employees"));
}

export async function listDepartments(): Promise<Department[]> {
  return unwrap(await apiFetch("/departments"));
}

export async function listBranches(): Promise<Branch[]> {
  return unwrap(await apiFetch("/branches"));
}

export interface CreateEmployeeInput {
  employeeCode: string;
  fullName: string;
  email: string;
  departmentId?: string;
  branchId?: string;
  position?: string;
  role?: Role;
}

export interface CreatedEmployee extends Employee {
  tempPassword: string;
}

export async function createEmployee(input: CreateEmployeeInput): Promise<CreatedEmployee> {
  return unwrap(
    await apiFetch("/employees", { method: "POST", body: JSON.stringify(input) }),
  );
}

export interface UpdateEmployeeInput {
  role?: Role;
  directManagerId?: string | null;
  status?: Status;
}

export async function updateEmployee(id: string, input: UpdateEmployeeInput): Promise<Employee> {
  return unwrap(
    await apiFetch(`/employees/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  );
}

export interface EmployeeQuota {
  id: string;
  leaveTypeId: string;
  totalDays: string;
  leaveType: { id: string; name: string };
}

export async function getEmployeeQuotas(id: string): Promise<EmployeeQuota[]> {
  return unwrap(await apiFetch(`/employees/${id}/quotas`));
}

export async function updateEmployeeQuotas(
  id: string,
  quotas: { leaveTypeId: string; totalDays: number }[],
): Promise<EmployeeQuota[]> {
  return unwrap(
    await apiFetch(`/employees/${id}/quotas`, { method: "PATCH", body: JSON.stringify({ quotas }) }),
  );
}

export interface BulkImportRowError {
  row: number;
  employeeCode: string;
  message: string;
}

export interface BulkImportCredential {
  row: number;
  employeeCode: string;
  email: string;
  tempPassword: string;
}

export interface BulkImportResult {
  totalRows: number;
  created: number;
  updated: number;
  unchanged: number;
  errors: BulkImportRowError[];
  credentials: BulkImportCredential[];
}

export async function bulkImportEmployees(csvText: string): Promise<BulkImportResult> {
  return unwrap(
    await apiFetch("/employees/bulk-import", { method: "POST", body: JSON.stringify({ csvText }) }),
  );
}
