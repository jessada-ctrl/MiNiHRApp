"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import AppShell from "@/components/AppShell";
import { getApiOrigin } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { type LineConfig, getLineConfig, updateLineConfig } from "@/lib/lineConfig";
import { type ChatbotLeaveVisibility, getChatbotConfig, updateChatbotConfig } from "@/lib/chatbotConfig";

const SECRET_PLACEHOLDER = "•••• ตั้งค่าไว้แล้ว — เว้นว่างไว้ถ้าไม่ต้องการเปลี่ยน";

// Module-level so their identity is stable across renders — useSyncExternalStore
// re-subscribes whenever the subscribe function changes.
const subscribeToNothing = () => () => {};
const getServerApiOrigin = () => "";

const VISIBILITY_OPTIONS: { value: ChatbotLeaveVisibility; label: string; hint: string }[] = [
  { value: "hr_only", label: "ฝ่ายบุคคลเท่านั้น", hint: "หัวหน้างานและพนักงานถามผ่านแชทบอทไม่ได้" },
  { value: "hr_and_approver", label: "ฝ่ายบุคคล + หัวหน้างาน", hint: "หัวหน้างานถามได้ด้วย (เห็นภาพรวมทั้งบริษัทเหมือน HR) ส่วนพนักงานทั่วไปถามไม่ได้" },
  { value: "everyone", label: "พนักงานทุกคน", hint: "ทุกคนในบริษัทถามผ่านแชทบอท LINE ได้" },
];

export default function SettingsPage() {
  const [config, setConfig] = useState<LineConfig | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  // getApiOrigin() falls back to window.location.origin in the single-origin
  // deploy, which doesn't exist on the server — so this is read through
  // useSyncExternalStore with a distinct server snapshot ("") rather than a
  // setState in an effect, which would hydrate to one value and immediately
  // re-render with another. There is nothing to subscribe to: the origin
  // can't change without a full page load.
  const apiOrigin = useSyncExternalStore(subscribeToNothing, getApiOrigin, getServerApiOrigin);

  const [channelId, setChannelId] = useState("");
  const [liffId, setLiffId] = useState("");
  const [channelSecret, setChannelSecret] = useState("");
  const [accessToken, setAccessToken] = useState("");

  const [visibility, setVisibility] = useState<ChatbotLeaveVisibility>("hr_only");
  const [visibilityLoading, setVisibilityLoading] = useState(true);
  const [visibilityError, setVisibilityError] = useState<string | null>(null);
  const [visibilitySuccess, setVisibilitySuccess] = useState<string | null>(null);
  const [visibilitySaving, setVisibilitySaving] = useState(false);

  useEffect(() => {
    getChatbotConfig()
      .then((c) => setVisibility(c.whoIsOnLeaveVisibility))
      .catch((err) => setVisibilityError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"))
      .finally(() => setVisibilityLoading(false));
  }, []);

  async function handleVisibilitySubmit(next: ChatbotLeaveVisibility) {
    setVisibilityError(null);
    setVisibilitySuccess(null);
    setVisibilitySaving(true);
    try {
      const updated = await updateChatbotConfig({ whoIsOnLeaveVisibility: next });
      setVisibility(updated.whoIsOnLeaveVisibility);
      setVisibilitySuccess("บันทึกแล้ว");
    } catch (err) {
      setVisibilityError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setVisibilitySaving(false);
    }
  }

  const refresh = useCallback(() => {
    return getLineConfig()
      .then((c) => {
        setError(null);
        setConfig(c);
        setChannelId(c.lineChannelId ?? "");
        setLiffId(c.lineLiffId ?? "");
        setChannelSecret("");
        setAccessToken("");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
      })
      .finally(() => {
        setLoading(false);
      });
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
        lineLiffId: liffId.trim() === "" ? undefined : liffId.trim(),
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

  // Both URLs are per-tenant: the origin is whatever subdomain this admin is
  // signed in on, which is exactly what LINE must call back / open.
  const webhookUrl = tenantId && apiOrigin ? `${apiOrigin}/v1/webhook/line/${tenantId}` : null;
  const liffEndpointUrl = apiOrigin ? `${apiOrigin}/liff` : null;

  function handleCopy(key: string, value: string) {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  return (
    <AppShell title="ตั้งค่า LINE OA">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">ตั้งค่า LINE OA</h1>
        <p className="mt-1 text-sm text-ink-3">
          นำ Channel ID, Channel Secret และ Channel Access Token จาก LINE Developers Console (ประเภท Messaging API เท่านั้น — ไม่ใช่ LINE Login) มากรอกที่นี่
        </p>

        {loading && <p className="mt-4 text-sm text-ink-3">กำลังโหลด...</p>}

        {!loading && config && (
          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4 rounded-lg border border-hairline bg-surface shadow-e1 p-5">
            <label className="block">
              <span className="block text-sm font-medium text-ink-2">Channel ID</span>
              <input
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                className="mt-1 w-full rounded-md border border-hairline-strong px-3 py-2 text-sm"
              />
            </label>

            <label className="block">
              <span className="block text-sm font-medium text-ink-2">LIFF ID</span>
              <input
                value={liffId}
                onChange={(e) => setLiffId(e.target.value)}
                placeholder="เช่น 2010683188-c6CdKvGw"
                className="mt-1 w-full rounded-md border border-hairline-strong px-3 py-2 text-sm"
              />
              <span className="mt-1 block text-xs text-ink-3">
                จาก LINE Developers Console → LINE Login → LIFF — พนักงานของบริษัทคุณจะเปิดแอปผ่าน LIFF ID นี้
              </span>
            </label>

            <label className="block">
              <span className="block text-sm font-medium text-ink-2">Channel Secret</span>
              <input
                type="text"
                autoComplete="off"
                value={channelSecret}
                onChange={(e) => setChannelSecret(e.target.value)}
                placeholder={config.hasChannelSecret ? SECRET_PLACEHOLDER : ""}
                className="mt-1 w-full rounded-md border border-hairline-strong px-3 py-2 text-sm"
              />
            </label>

            <label className="block">
              <span className="block text-sm font-medium text-ink-2">Channel Access Token</span>
              <input
                type="text"
                autoComplete="off"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder={config.hasChannelAccessToken ? SECRET_PLACEHOLDER : ""}
                className="mt-1 w-full rounded-md border border-hairline-strong px-3 py-2 text-sm"
              />
            </label>

            {error && <p className="text-sm text-rejected-fg">{error}</p>}
            {success && <p className="text-sm text-brand-ink">{success}</p>}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-e1 transition-colors duration-150 hover:bg-brand-600 disabled:opacity-60"
              >
                {saving ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </form>
        )}

        {!loading && webhookUrl && (
          <div className="mt-6 rounded-lg border border-hairline bg-surface shadow-e1 p-5">
            <h2 className="text-sm font-semibold text-ink">URL ที่ต้องนำไปตั้งค่าใน LINE</h2>
            <p className="mt-1 text-sm text-ink-3">
              ทั้งสอง URL นี้เป็นของบริษัทคุณโดยเฉพาะ (อิงจากโดเมนที่คุณกำลังใช้งานอยู่)
            </p>

            <p className="mt-4 text-xs font-medium text-ink-2">
              Webhook URL — วางใน Messaging API → Webhook URL แล้วกด Verify
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="flex-1 truncate rounded-md bg-quiet-bg px-3 py-2 text-xs text-ink-2">{webhookUrl}</code>
              <button
                type="button"
                onClick={() => handleCopy("webhook", webhookUrl)}
                className="shrink-0 rounded-md border border-hairline-strong px-3 py-2 text-xs font-medium text-ink-2 hover:bg-quiet-bg"
              >
                {copied === "webhook" ? "คัดลอกแล้ว ✓" : "คัดลอก"}
              </button>
            </div>

            {liffEndpointUrl && (
              <>
                <p className="mt-4 text-xs font-medium text-ink-2">
                  LIFF Endpoint URL — วางใน LINE Login → LIFF → Endpoint URL
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <code className="flex-1 truncate rounded-md bg-quiet-bg px-3 py-2 text-xs text-ink-2">{liffEndpointUrl}</code>
                  <button
                    type="button"
                    onClick={() => handleCopy("liff", liffEndpointUrl)}
                    className="shrink-0 rounded-md border border-hairline-strong px-3 py-2 text-xs font-medium text-ink-2 hover:bg-quiet-bg"
                  >
                    {copied === "liff" ? "คัดลอกแล้ว ✓" : "คัดลอก"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        <div className="mt-6 rounded-lg border border-hairline bg-surface shadow-e1 p-5">
          <h2 className="text-sm font-semibold text-ink">แชทบอท: ใครถามได้ว่า &quot;ใครลาวันนี้บ้าง&quot;</h2>
          <p className="mt-1 text-sm text-ink-3">
            ฝ่ายบุคคลถามได้เสมอไม่ว่าจะตั้งค่านี้ไว้อย่างไร — ตัวเลือกนี้แค่กำหนดว่าจะเปิดให้คนอื่นถามผ่านแชทบอท LINE ได้ด้วยหรือไม่
          </p>

          {visibilityLoading ? (
            <p className="mt-4 text-sm text-ink-3">กำลังโหลด...</p>
          ) : (
            <div className="mt-4 flex flex-col gap-2">
              {VISIBILITY_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors duration-150 ${
                    visibility === opt.value ? "border-brand-500 bg-brand-500/10" : "border-hairline-strong hover:bg-quiet-bg"
                  }`}
                >
                  <input
                    type="radio"
                    name="chatbot-visibility"
                    checked={visibility === opt.value}
                    onChange={() => handleVisibilitySubmit(opt.value)}
                    disabled={visibilitySaving}
                    className="mt-1 accent-brand-500"
                  />
                  <span>
                    <span className="block text-sm font-medium text-ink">{opt.label}</span>
                    <span className="block text-xs text-ink-3">{opt.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          )}

          {visibilityError && <p className="mt-3 text-sm text-rejected-fg">{visibilityError}</p>}
          {visibilitySuccess && <p className="mt-3 text-sm text-brand-ink">{visibilitySuccess}</p>}
        </div>
      </div>
    </AppShell>
  );
}
