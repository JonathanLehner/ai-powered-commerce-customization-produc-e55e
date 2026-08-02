import "server-only";

import { inspectImage } from "./mockup";
import { uploadFile } from "./platform";
import type { StoredImage, UploadScope } from "./types";

/**
 * Files never travel through a server action.
 *
 * A Server Action request body is capped at 1 MB, and the cap is enforced
 * before the action runs — the request is rejected with a 500 the app cannot
 * turn into a field error, which is what the "server error occurred" page was.
 * Every upload therefore posts its raw bytes to `/api/uploads`, which stores
 * them and returns metadata; the action only ever receives that small JSON.
 */

export const ASSET_ORIGIN = "https://assets.clawcorp.ai";

export interface UploadScopeRules {
  types: string[];
  maxBytes: number;
  /** True when the stored file must be a raster image we can measure. */
  requireDimensions: boolean;
}

const RASTER = ["image/png", "image/jpeg", "image/webp"];

export const UPLOAD_SCOPES: Record<UploadScope, UploadScopeRules> = {
  // Print-ready artwork for a product in the workspace configurator.
  artwork: { types: RASTER, maxBytes: 25 * 1024 * 1024, requireDimensions: true },
  // A preview the browser composited from supplier photography.
  mockup: { types: RASTER, maxBytes: 8 * 1024 * 1024, requireDimensions: true },
  // Store branding. SVG is allowed here and has no pixel dimensions.
  logo: { types: [...RASTER, "image/svg+xml"], maxBytes: 8 * 1024 * 1024, requireDimensions: false },
  // Artwork a shopper attaches to a personalised line on the storefront.
  shopperArtwork: { types: RASTER, maxBytes: 25 * 1024 * 1024, requireDimensions: true },
  shopperPreview: { types: RASTER, maxBytes: 8 * 1024 * 1024, requireDimensions: false },
};

export type StoreUploadResult =
  | { ok: true; image: StoredImage }
  | { ok: false; status: number; message: string };

function labelFor(types: string[]): string {
  const names = types.map((t) => (t === "image/jpeg" ? "JPG" : t.split("/")[1].replace("+xml", "").toUpperCase()));
  if (names.length < 2) return names.join("");
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

function safeFileName(raw: string, mimeType: string): string {
  const cleaned = raw.replace(/[\r\n\t]/g, " ").trim().slice(0, 120);
  if (cleaned) return cleaned;
  return `upload.${mimeType.split("/")[1]?.split("+")[0] ?? "bin"}`;
}

/**
 * Validates raw bytes against a scope's rules and puts them in the asset store.
 * Returns the metadata the callers persist alongside the URL.
 */
export async function storeUpload(
  scope: UploadScope,
  bytes: Uint8Array,
  mimeType: string,
  fileName: string,
): Promise<StoreUploadResult> {
  const rules = UPLOAD_SCOPES[scope];
  const type = mimeType.split(";")[0].trim().toLowerCase();

  if (!rules.types.includes(type)) {
    return { ok: false, status: 415, message: `Upload a ${labelFor(rules.types)} file.` };
  }
  if (bytes.byteLength === 0) {
    return { ok: false, status: 400, message: "That file is empty." };
  }
  if (bytes.byteLength > rules.maxBytes) {
    return {
      ok: false,
      status: 413,
      message: `That file is ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB. The limit is ${Math.round(rules.maxBytes / 1024 / 1024)} MB.`,
    };
  }

  const meta = inspectImage(bytes);
  if (rules.requireDimensions && (!meta.width || !meta.height)) {
    return { ok: false, status: 422, message: "That file could not be read as an image." };
  }

  const url = await uploadFile(bytes, type);
  return {
    ok: true,
    image: {
      url,
      fileName: safeFileName(fileName, type),
      mimeType: type,
      sizeBytes: bytes.byteLength,
      pixelWidth: meta.width,
      pixelHeight: meta.height,
      hasAlpha: meta.hasAlpha,
    },
  };
}

/** Guards a URL that arrived from the browser before it is written to a record. */
export function isStoredAsset(url: string): boolean {
  try {
    return new URL(url).origin === ASSET_ORIGIN;
  } catch {
    return false;
  }
}

/**
 * Rebuilds the metadata for an already-stored upload out of form fields. The
 * bytes were validated by `/api/uploads`; this re-checks everything the browser
 * could have tampered with on the way back.
 */
export function readStoredImage(formData: FormData, prefix: string, scope: UploadScope): StoredImage | null {
  const url = String(formData.get(`${prefix}Url`) ?? "");
  if (!url || !isStoredAsset(url)) return null;

  const mimeType = String(formData.get(`${prefix}Type`) ?? "");
  if (!UPLOAD_SCOPES[scope].types.includes(mimeType)) return null;

  const num = (key: string) => {
    const value = Number(formData.get(`${prefix}${key}`) ?? 0);
    return Number.isFinite(value) && value >= 0 ? value : 0;
  };
  return {
    url,
    fileName: safeFileName(String(formData.get(`${prefix}Name`) ?? ""), mimeType),
    mimeType,
    sizeBytes: num("Bytes"),
    pixelWidth: num("Width"),
    pixelHeight: num("Height"),
    hasAlpha: formData.get(`${prefix}Alpha`) === "1",
  };
}
