"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { getCurrentUser } from "@/lib/auth";
import { type LineConfig, getLineConfig, updateLineConfig } from "@/lib/lineConfig";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const SECRET_PLACEHOLDER = "•••• ตั้งค่าไว้แล้ว — เว้นว่างไว้ถ้าไม่ต้องการเปลี่ยน";

export default function SettingsPage() {
  const [config, setConfig] = useState<LineConfig | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const [channelId, setChannelId] = useState("");
  const [channelSecret, setChannelSecret] = useState("");
  const [accessToken, setAccessToken] = useState("");

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const c = await getLineConfig();
      setConfig(c);
      setChannelId(c.lineChannelId ?? "");
      setChannelSecret("");
      setAccessToken("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    getCurrentUser().then((u) => setTenantId(u?.tenantId ?? null));
  }, [refresh]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      await updateLineConfig({
        lineChannelId: channelId.trim() === "" ? undefined : channelId.trim(),
        lineChannelSecret: channelSecret.trim() === "" ? undefined : channelSecret.trim(),
        lineChannelAccessToken: accessToken.trim() === "" ? undefined : accessToken.trim(),
      });
      setSuccess("บันทึกการตั้งค่า LINE OA เรียบร้อยแล้ว");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  const webhookUrl = tenantId ? `${API_URL}/v1/webhook/line/${tenantId}` : null;

  function handleCopy() {
    if (!webhookUrl) return;
    navigator.clipboard.writeText(webhookUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <AppShell title="ตั้งค่า LINE OA">
      <div className="max-w-2xl">
        <h1 className="text-xl font-semibold text-neutral-900">ตั้งค่า LINE OA</h1>
        <p className="mt-1 text-sm text-neutral-500">
          นำ Channel ID, Channel Secret และ Channel Access Token จาก LINE Developers Console (ประเภท Messaging API เท่านั้น — ไม่ใช่ LINE Login) มากรอกที่นี่
        </p>

        {loading && <p className="mt-4 text-sm text-neutral-400">กำลังโหลด...</p>}

        {!loading && config && (
          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4 rounded-lg border border-neutral-200 bg-white p-5">
            <label className="block">
              <span className="block text-sm font-medium text-neutral-700">Channel ID</span>
              <input
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </label>

            <label className="block">
              <span className="block text-sm font-medium text-neutral-700">Channel Secret</span>
              <input
                type="password"
                value={channelSecret}
                onChange={(e) => setChannelSecret(e.target.value)}
                placeholder={config.hasChannelSecret ? SECRET_PLACEHOLDER : ""}
                className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </label>

            <label className="block">
              <span className="block text-sm font-medium text-neutral-700">Channel Access Token</span>
              <input
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder={config.hasChannelAccessToken ? SECRET_PLACEHOLDER : ""}
                className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </label>

            {error && <p className="text-sm text-red-600">{error}</p>}
            {success && <p className="text-sm text-sky-700">{success}</p>}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-60"
              >
                {saving ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </form>
        )}

        {!loading && webhookUrl && (
          <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-neutral-900">Webhook URL</h2>
            <p className="mt-1 text-sm text-neutral-500">
              นำ URL นี้ไปวางใน LINE Developers Console → Messaging API → Webhook URL แล้วกด Verify (ต้องเปิด backend ผ่าน ngrok หรือ deploy จริงก่อนถึงจะ verify ผ่าน)
            </p>
            <div className="mt-3 flex items-center gap-2">
              <code className="flex-1 truncate rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-700">{webhookUrl}</code>
              <button
                type="button"
                onClick={handleCopy}
                className="shrink-0 rounded-md border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
              >
                {copied ? "คัดลอกแล้ว ✓" : "คัดลอก"}
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
