import { apiFetch } from "./api";

export interface Holiday {
  id: string;
  holidayDate: string;
  name: string;
  notifyDaysBefore: number;
}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export async function listHolidays(): Promise<Holiday[]> {
  return unwrap(await apiFetch("/holidays"));
}

export async function createHoliday(input: { date: string; name: string; notifyDaysBefore: number }): Promise<Holiday> {
  return unwrap(await apiFetch("/holidays", { method: "POST", body: JSON.stringify(input) }));
}

export async function deleteHoliday(id: string): Promise<void> {
  const res = await apiFetch(`/holidays/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Request failed (${res.status})`);
  }
}
