import { apiFetch } from "./api";

export type ChatbotLeaveVisibility = "hr_only" | "hr_and_approver" | "everyone";

export interface ChatbotConfig {
  whoIsOnLeaveVisibility: ChatbotLeaveVisibility;
}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export async function getChatbotConfig(): Promise<ChatbotConfig> {
  return unwrap(await apiFetch("/settings/chatbot-config"));
}

export async function updateChatbotConfig(input: ChatbotConfig): Promise<ChatbotConfig> {
  return unwrap(await apiFetch("/settings/chatbot-config", { method: "PATCH", body: JSON.stringify(input) }));
}
