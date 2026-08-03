// Real LIFF ids look like "1234567890-abcdEFGh" (numeric app id, hyphen,
// alphanumeric suffix) — used to tell a genuine id apart from an unset,
// empty, or placeholder value (e.g. "REPLACE_WITH_LINE_LIFF_ID") left in a
// local .env file, so a stray placeholder can't make the app think LIFF is
// configured when it isn't.
const LIFF_ID_SHAPE = /^\d+-[a-zA-Z0-9]+$/;

function configuredLiffId(): string | null {
  const value = process.env.NEXT_PUBLIC_LIFF_ID;
  return value && LIFF_ID_SHAPE.test(value) ? value : null;
}

/**
 * FR-2.1/2.3 need the real LINE user id, which comes from the LIFF SDK.
 * `liff.login()` redirects the browser away and back — when it fires this
 * returns null for the in-flight call, which is fine, since the page
 * navigates away anyway and the caller re-runs after the redirect back.
 */
export async function getLineUserId(): Promise<string | null> {
  const liffId = configuredLiffId();
  if (!liffId) return null;

  const liff = (await import('@line/liff')).default;
  await liff.init({ liffId });

  if (!liff.isLoggedIn()) {
    liff.login();
    return null;
  }

  const profile = await liff.getProfile();
  return profile.userId;
}

export function isLiffConfigured(): boolean {
  return configuredLiffId() !== null;
}

/**
 * `liff.login()` (called from getLineUserId, above) redirects out to LINE and
 * back — but the callback always lands on this app's bare LIFF Endpoint URL
 * (root `/`), never on whichever page called login() in the first place.
 * `liff.init()` is what actually reads the callback params from the URL and
 * persists the resulting session — if nothing on the root page ever calls
 * it, the login the user just completed is silently thrown away, and
 * `isLoggedIn()` keeps coming back false forever on every later page.
 * Call this once from the root page's mount effect so that callback always
 * gets a chance to complete, regardless of which page originally triggered it.
 */
export async function completePendingLiffLogin(): Promise<void> {
  const liffId = configuredLiffId();
  if (!liffId) return;
  try {
    const liff = (await import('@line/liff')).default;
    await liff.init({ liffId });
  } catch {
    // best-effort — getLineUserId() will surface a real error later if LIFF is genuinely broken
  }
}

/**
 * FR-2.3's "สแกน QR เข้างาน" button — opens LINE's native QR reader
 * (liff.scanCodeV2) and resolves to whatever string it read. Only works
 * inside the real LINE app; outside it (e.g. LIFF not configured yet in
 * this local checkout), the caller should fall back to manual entry instead
 * of surfacing this as a hard error.
 */
export async function scanQrCode(): Promise<string | null> {
  const liffId = configuredLiffId();
  if (!liffId) throw new Error('LIFF_NOT_CONFIGURED');

  const liff = (await import('@line/liff')).default;
  await liff.init({ liffId });
  const result = await liff.scanCodeV2();
  return result.value ?? null;
}
