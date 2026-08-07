import { apiFetch, unwrap } from "./api";

export interface MyProfile {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string;
  phone: string | null;
  position: string | null;
  department: { id: string; departmentName: string } | null;
  branch: { id: string; branchName: string } | null;
}

export async function getMyProfile(): Promise<MyProfile> {
  return unwrap(await apiFetch("/employees/me"));
}

export interface UpdateMyProfileInput {
  fullName?: string;
  email?: string;
  phone?: string;
}

export async function updateMyProfile(input: UpdateMyProfileInput): Promise<MyProfile> {
  return unwrap(
    await apiFetch("/employees/me", { method: "PATCH", body: JSON.stringify(input) }),
  );
}
