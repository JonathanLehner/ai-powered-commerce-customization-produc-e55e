import type { NextRequest } from "next/server";

import { getStore, getStoreProduct } from "@/lib/data";
import { assertStoreAccess } from "@/lib/session";
import { storeUpload, UPLOAD_SCOPES } from "@/lib/uploads";
import type { UploadScope } from "@/lib/types";

/**
 * Single entry point for every user-supplied file.
 *
 * Server Actions reject request bodies over 1 MB before the action code runs,
 * so a logo of any realistic size posted through a form action came back as an
 * unrecoverable server error. Uploads post their raw bytes here instead; the
 * response carries the stored URL and the metadata, and the form action that
 * follows only ever moves that small JSON.
 */

function fail(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

/** Each scope is authorised as the feature that uses it would be. */
async function authorise(scope: UploadScope, params: URLSearchParams): Promise<string | null> {
  const storeId = params.get("storeId") ?? "";

  if (scope === "artwork" || scope === "mockup") {
    await assertStoreAccess(storeId, "store.catalog");
    return null;
  }
  if (scope === "logo") {
    await assertStoreAccess(storeId, "store.settings");
    return null;
  }

  // Storefront uploads are anonymous, so they are tied to a product that is
  // published and actually invites shopper artwork.
  const store = await getStore(storeId);
  if (!store || store.status !== "active") return "This store is not currently taking orders.";
  const product = await getStoreProduct(params.get("productId") ?? "");
  if (!product || product.storeId !== storeId || product.status !== "published") {
    return "That product is no longer available.";
  }
  if (scope === "shopperArtwork" && !product.shopperCustomization.artworkUpload) {
    return "This product does not accept uploaded artwork.";
  }
  return null;
}

export async function POST(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const scope = params.get("scope") as UploadScope | null;
  if (!scope || !(scope in UPLOAD_SCOPES)) return fail("Unknown upload type.", 400);

  const rules = UPLOAD_SCOPES[scope];
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > rules.maxBytes) {
    return fail(
      `That file is ${(declaredLength / 1024 / 1024).toFixed(1)} MB. The limit is ${Math.round(rules.maxBytes / 1024 / 1024)} MB.`,
      413,
    );
  }

  try {
    const denied = await authorise(scope, params);
    if (denied) return fail(denied, 403);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "You are not allowed to upload here.", 403);
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  const result = await storeUpload(
    scope,
    bytes,
    request.headers.get("content-type") ?? "",
    params.get("name") ?? "",
  );
  if (!result.ok) return fail(result.message, result.status);
  return Response.json(result.image);
}
