import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { SITE_ORIGIN } from "./seo";
import { UPLOAD_PATH, uploadNameOf } from "./upload-paths";

/**
 * User files live in the project's R2 bucket (the `BUCKET` binding in
 * wrangler.jsonc) under `uploads/`, and are served back by
 * `/api/files/uploads/[name]`. Files uploaded before the move keep their
 * https://assets.clawcorp.ai addresses.
 */

interface StoredObject {
  body: ReadableStream;
  size: number;
  httpEtag: string;
  httpMetadata?: { contentType?: string };
  range?: { offset?: number; length?: number; suffix?: number };
  arrayBuffer(): Promise<ArrayBuffer>;
}

interface Bucket {
  put(key: string, value: Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string, options?: { range?: Headers }): Promise<StoredObject | null>;
}

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

function bucket(): Bucket {
  const found = (getCloudflareContext().env as unknown as { BUCKET?: Bucket }).BUCKET;
  if (!found) throw new Error("The BUCKET storage binding is not configured");
  return found;
}

/** Stores the bytes and returns the app address they are served from. */
export async function putUpload(bytes: Uint8Array, contentType: string): Promise<string> {
  const extension = EXTENSIONS[contentType];
  if (!extension) throw new Error(`Unsupported file type: ${contentType}`);
  const name = `${crypto.randomUUID().replaceAll("-", "")}.${extension}`;
  await bucket().put(`uploads/${name}`, bytes, { httpMetadata: { contentType } });
  return `${SITE_ORIGIN}${UPLOAD_PATH}${name}`;
}

/** The bucket key behind one of the app's upload addresses, absolute or root-relative. */
export function uploadKeyOf(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url, SITE_ORIGIN);
  } catch {
    return null;
  }
  if (parsed.origin !== SITE_ORIGIN || parsed.search || parsed.hash) return null;
  const name = uploadNameOf(parsed.pathname);
  return name ? `uploads/${name}` : null;
}

/** A stored object for streaming, honouring a Range header when one is sent. */
export async function getUpload(key: string, range?: Headers): Promise<StoredObject | null> {
  return bucket().get(key, range ? { range } : undefined);
}

/** A stored file's bytes and type, for server code that measures or redraws it. */
export async function readUpload(key: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const object = await bucket().get(key);
  if (!object) return null;
  return { bytes: new Uint8Array(await object.arrayBuffer()), contentType: object.httpMetadata?.contentType ?? "" };
}
