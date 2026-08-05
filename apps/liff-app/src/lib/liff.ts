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
 * Best-effort silent re-auth: returns the current LIFF ID token if the LINE
 * session inside this LIFF app is already live (e.g. opened via a Rich Menu
 * button), without ever calling `liff.login()` — unlike `getLineUserId`,
 * this must never redirect the browser away, since it runs automatically on
 * every page load to recover from an expired app JWT. Returns null if LIFF
 * isn't configured or the LINE session itself isn't live, so the caller can
 * fall back to the manual `/login` screen.
 */
export async function getLineIdToken(): Promise<string | null> {
  const liffId = configuredLiffId();
  if (!liffId) return null;

  const liff = (await import('@line/liff')).default;
  // Same bounded-timeout pattern as completePendingLiffLogin — this runs on
  // every page load via resolveCurrentUser(), so a hung liff.init() here must
  // not block the silent re-login path forever.
  await Promise.race([liff.init({ liffId }), new Promise((resolve) => setTimeout(resolve, 4000))]);

  if (!liff.isLoggedIn()) return null;
  const idToken = liff.getIDToken();
  if (!idToken) {
    // isLoggedIn() true but no ID token means the LIFF app's LINE Login
    // channel doesn't have the "openid" scope granted (or the SDK hasn't
    // refreshed it yet) — surface this distinctly so it doesn't read as a
    // generic "not logged in" case during diagnosis.
    console.warn('[liff] isLoggedIn() is true but getIDToken() returned null (check the "openid" scope)');
  }
  return idToken;
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
 * this local checkout, or a real LIFF id opened in a plain desktop browser
 * during testing), the caller should fall back to manual entry instead of
 * surfacing this as a hard error — scanCodeV2() itself doesn't fail
 * cleanly for that case, it throws the LIFF SDK's own internal
 * "Need access_token..." error, which isLoggedIn()-then-login() upstream
 * (getLineUserId) never even reaches here to prevent.
 */
export async function scanQrCode(): Promise<string | null> {
  const liffId = configuredLiffId();
  if (!liffId) throw new Error('LIFF_NOT_CONFIGURED');

  const liff = (await import('@line/liff')).default;
  await liff.init({ liffId });
  if (!liff.isInClient()) throw new Error('LIFF_NOT_CONFIGURED');

  const result = await liff.scanCodeV2();
  return result.value ?? null;
}
