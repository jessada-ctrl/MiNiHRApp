/**
 * FR-2.1/2.3 need the real LINE user id, which in production comes from the
 * LIFF SDK (`liff.init({ liffId })` then `liff.getProfile().userId`). There
 * is no real LIFF app registered yet (`NEXT_PUBLIC_LIFF_ID` unset), so this
 * returns null and the register page falls back to a manual "LINE User ID"
 * input field for local testing.
 *
 * Once a real LIFF ID exists, swap the body of this function for:
 *   import liff from '@line/liff';
 *   await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID! });
 *   if (!liff.isLoggedIn()) { liff.login(); return null; }
 *   const profile = await liff.getProfile();
 *   return profile.userId;
 * (requires adding the `@line/liff` package, not installed today since it
 * can't be exercised without a real liffId.)
 */
export async function getLineUserId(): Promise<string | null> {
  if (process.env.NEXT_PUBLIC_LIFF_ID) {
    throw new Error("NEXT_PUBLIC_LIFF_ID is set but the real LIFF SDK integration hasn't been wired in yet");
  }
  return null;
}

export function isLiffConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_LIFF_ID);
}
