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
 * FR-2.1/2.3 need the real LINE user id, which in production comes from the
 * LIFF SDK (`liff.init({ liffId })` then `liff.getProfile().userId`). There
 * is no real LIFF app registered yet, so this returns null and the register
 * page falls back to a manual "LINE User ID" input field for local testing.
 *
 * Once a real LIFF ID exists, swap the body of this function for:
 *   import liff from '@line/liff';
 *   await liff.init({ liffId: configuredLiffId()! });
 *   if (!liff.isLoggedIn()) { liff.login(); return null; }
 *   const profile = await liff.getProfile();
 *   return profile.userId;
 * (requires adding the `@line/liff` package, not installed today since it
 * can't be exercised without a real liffId.)
 */
export async function getLineUserId(): Promise<string | null> {
  if (configuredLiffId()) {
    throw new Error("NEXT_PUBLIC_LIFF_ID is set but the real LIFF SDK integration hasn't been wired in yet");
  }
  return null;
}

export function isLiffConfigured(): boolean {
  return configuredLiffId() !== null;
}
