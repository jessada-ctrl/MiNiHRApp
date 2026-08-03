import { apiFetch, unwrap } from "./api";

export type CheckType = "in" | "out";
export type CheckMethod = "qr" | "gps";

export interface AttendanceBranch {
  id: string;
  branchName: string;
  address: string | null;
  latitude: string;
  longitude: string;
  radiusMeters: number;
}

export interface TodayAttendanceLog {
  id: string;
  checkType: CheckType;
  method: CheckMethod;
  timestamp: string;
  branchName: string | null;
}

export interface AttendanceStatus {
  branch: AttendanceBranch | null;
  todayLogs: TodayAttendanceLog[];
  nextAction: CheckType;
}

export async function getAttendanceStatus(): Promise<AttendanceStatus> {
  return unwrap(await apiFetch("/attendance/status"));
}

export interface CheckResult {
  id: string;
  checkType: CheckType;
  method: CheckMethod;
  timestamp: string;
  branch: { id: string; branchName: string; address: string | null; radiusMeters: number };
  distanceMeters?: number;
}

export async function checkQr(qrToken: string): Promise<CheckResult> {
  const res = await apiFetch("/attendance/check", { method: "POST", body: JSON.stringify({ method: "qr", qrToken }) });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export async function checkGps(latitude: number, longitude: number): Promise<CheckResult> {
  const res = await apiFetch("/attendance/check", { method: "POST", body: JSON.stringify({ method: "gps", latitude, longitude }) });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Request failed (${res.status})`);
  }
  return res.json();
}
