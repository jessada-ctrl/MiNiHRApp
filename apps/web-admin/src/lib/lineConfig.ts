import { apiFetch } from "./api";

export interface LineConfig {
  lineChannelId: string | null;
  hasChannelSecret: boolean;
  hasChannelAccessToken: boolean;
}

export interface UpdateLineConfigInput {
  lineChannelId?: string;
  lineChannelSecret?: string;
  lineChannelAccessToken?: string;
}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export async function getLineConfig(): Promise<LineConfig> {
  return unwrap(await apiFetch("/settings/line-config"));
}

export async function updateLineConfig(input: UpdateLineConfigInput): Promise<LineConfig> {
  return unwrap(await apiFetch("/settings/line-config", { method: "PATCH", body: JSON.stringify(input) }));
}
