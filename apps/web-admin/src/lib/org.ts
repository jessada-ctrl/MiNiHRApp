import { apiFetch } from "./api";

export interface Branch {
  id: string;
  branchName: string;
  address: string | null;
  latitude: string;
  longitude: string;
  radiusMeters: number;
  isActive: boolean;
}

export interface Department {
  id: string;
  departmentName: string;
  branchId: string | null;
  isActive: boolean;
  branch: { id: string; branchName: string } | null;
}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export async function listBranches(): Promise<Branch[]> {
  return unwrap(await apiFetch("/branches"));
}

export interface CreateBranchInput {
  branchName: string;
  address?: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export async function createBranch(input: CreateBranchInput): Promise<Branch> {
  return unwrap(await apiFetch("/branches", { method: "POST", body: JSON.stringify(input) }));
}

export interface UpdateBranchInput {
  branchName?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  radiusMeters?: number;
  isActive?: boolean;
}

export async function updateBranch(id: string, input: UpdateBranchInput): Promise<Branch> {
  return unwrap(await apiFetch(`/branches/${id}`, { method: "PATCH", body: JSON.stringify(input) }));
}

export async function listDepartments(): Promise<Department[]> {
  return unwrap(await apiFetch("/departments"));
}

export interface CreateDepartmentInput {
  departmentName: string;
  branchId?: string;
}

export async function createDepartment(input: CreateDepartmentInput): Promise<Department> {
  return unwrap(await apiFetch("/departments", { method: "POST", body: JSON.stringify(input) }));
}

export interface UpdateDepartmentInput {
  departmentName?: string;
  branchId?: string | null;
  isActive?: boolean;
}

export async function updateDepartment(id: string, input: UpdateDepartmentInput): Promise<Department> {
  return unwrap(await apiFetch(`/departments/${id}`, { method: "PATCH", body: JSON.stringify(input) }));
}
