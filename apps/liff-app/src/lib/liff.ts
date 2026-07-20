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
