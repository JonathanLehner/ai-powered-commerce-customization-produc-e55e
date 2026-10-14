/**
 * A cookie scripts can read, set beside the Auth.js session while it lasts, so
 * the prerendered marketing pages can offer "Go to dashboard" instead of
 * "Sign in" without reading the request. It is display only: its value is a
 * plain "1", it grants nothing, and every workspace page still checks the
 * session itself.
 */
export const SIGNED_IN_HINT_COOKIE = "parcelith_signed_in";

/** Whether this browser has signed in to the workspace, as far as the page can tell. */
export function readSignedInHint(): boolean {
  return document.cookie.split("; ").includes(`${SIGNED_IN_HINT_COOKIE}=1`);
}
