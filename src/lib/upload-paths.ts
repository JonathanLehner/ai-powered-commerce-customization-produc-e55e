/**
 * Where the app serves the files stored in its own bucket. Kept free of
 * imports so the browser-side mockup renderer can recognise these addresses.
 */
export const UPLOAD_PATH = "/api/files/uploads/";

const NAME = /^[a-f0-9]{32}\.(png|jpg|webp|svg|mp4|webm)$/;

/** The stored file's name when `pathname` is one of the app's upload addresses. */
export function uploadNameOf(pathname: string): string | null {
  if (!pathname.startsWith(UPLOAD_PATH)) return null;
  const name = pathname.slice(UPLOAD_PATH.length);
  return NAME.test(name) ? name : null;
}
