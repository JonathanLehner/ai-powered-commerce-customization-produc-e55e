import "server-only";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { getCatalogProduct, recordAudit, updateStoreProduct } from "../data";
import { readUpload, uploadKeyOf } from "../file-store";
import { inspectImage } from "../mockup";
import { isStoredAsset, UPLOAD_SCOPES } from "../uploads";
import type { MockupImage, Store, StoredImage, StoreProduct, UploadScope } from "../types";
import { newId } from "../util";
import { OperationError, type OperationContext } from "./context";

/**
 * Artwork placement and mockups of a store product. The configurator's
 * actions and the Admin API both run these. Artwork and mockup writes go
 * through `updateStoreProduct`, which takes a published product back to review
 * when its previews are no longer all approved.
 */

function revalidateAfterArtworkChange(store: Store, productId: string) {
  revalidatePath(`/app/stores/${store.id}/catalog`);
  revalidatePath(`/app/stores/${store.id}/catalog/${productId}`);
  revalidatePath(`/s/${store.slug}`);
}

/* ------------------------------------------------------------ stored files */

/**
 * Reads an image already in the asset store and checks it against the upload
 * scope's rules, as `/api/uploads` checks a file before storing it. The API
 * sends only a URL, so the type, size and pixel dimensions are measured from
 * the stored bytes rather than taken on trust.
 */
export async function readStoredAsset(
  url: string,
  scope: UploadScope,
  field: string,
  fileName?: string,
): Promise<StoredImage> {
  const rules = UPLOAD_SCOPES[scope];
  if (!isStoredAsset(url)) {
    throw new OperationError("invalid", "Use an image already uploaded to the store's asset storage.", field);
  }
  const unreadable = () => new OperationError("invalid", "That file could not be read from the asset storage.", field);
  const tooLarge = (bytes: number) =>
    new OperationError(
      "invalid",
      `That file is ${(bytes / 1024 / 1024).toFixed(1)} MB. The limit is ${Math.round(rules.maxBytes / 1024 / 1024)} MB.`,
      field,
    );
  const checkType = (contentType: string) => {
    const type = contentType.split(";")[0].trim().toLowerCase();
    if (!rules.types.includes(type)) throw new OperationError("invalid", "Use a PNG, JPG or WEBP image.", field);
    return type;
  };

  let mimeType: string;
  let bytes: Uint8Array;
  const key = uploadKeyOf(url);
  if (key) {
    // The app's own bucket is read directly rather than through its address.
    const stored = await readUpload(key).catch(() => null);
    if (!stored) throw unreadable();
    mimeType = checkType(stored.contentType);
    bytes = stored.bytes;
  } else {
    let response: Response;
    try {
      response = await fetch(url, { cache: "no-store" });
    } catch {
      throw unreadable();
    }
    if (!response.ok) throw unreadable();
    mimeType = checkType(response.headers.get("content-type") ?? "");
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > rules.maxBytes) throw tooLarge(declared);
    bytes = new Uint8Array(await response.arrayBuffer());
  }
  if (bytes.byteLength === 0) throw new OperationError("invalid", "That file is empty.", field);
  if (bytes.byteLength > rules.maxBytes) throw tooLarge(bytes.byteLength);

  const meta = inspectImage(bytes);
  if (rules.requireDimensions && (!meta.width || !meta.height)) {
    throw new OperationError("invalid", "That file could not be read as an image.", field);
  }

  const name = (fileName ?? "").replace(/[\r\n\t]/g, " ").trim().slice(0, 120);
  return {
    url,
    fileName: name || new URL(url).pathname.split("/").pop() || `upload.${mimeType.split("/")[1]}`,
    mimeType,
    sizeBytes: bytes.byteLength,
    pixelWidth: meta.width,
    pixelHeight: meta.height,
    hasAlpha: meta.hasAlpha,
  };
}

/* --------------------------------------------------------------- placement */

export interface PlacementChange {
  x?: number;
  y?: number;
  scale?: number;
  rotation?: number;
}

/**
 * Moves, scales and rotates placed artwork. Values that are not finite numbers
 * keep the artwork's current value. A placement that has not moved writes
 * nothing; one that has clears the mockups, which no longer match it.
 */
export async function saveArtworkPlacement(
  ctx: OperationContext,
  product: StoreProduct,
  changes: Record<string, PlacementChange>,
): Promise<{ moved: boolean }> {
  const artworks = product.artworks.map((artwork) => {
    const change = changes[artwork.id] ?? {};
    const read = (value: number | undefined, fallback: number) =>
      value !== undefined && Number.isFinite(value) ? value : fallback;
    return {
      ...artwork,
      x: read(change.x, artwork.x),
      y: read(change.y, artwork.y),
      scale: Math.max(0.05, Math.min(2, read(change.scale, artwork.scale))),
      rotation: Math.max(-180, Math.min(180, read(change.rotation, artwork.rotation))),
    };
  });

  // Saving a placement that has not moved would still cost a write, a cache
  // invalidation and a full re-render of the page.
  const moved = artworks.some((artwork, index) => {
    const before = product.artworks[index];
    return (
      artwork.x !== before.x ||
      artwork.y !== before.y ||
      artwork.scale !== before.scale ||
      artwork.rotation !== before.rotation
    );
  });
  if (!moved) return { moved };

  await updateStoreProduct(product.id, { artworks, mockups: [] }, product);
  revalidateAfterArtworkChange(ctx.store, product.id);
  return { moved };
}

/* ----------------------------------------------------------------- mockups */

/** A rendered preview for one print area, and its optional share image. */
export interface RenderedMockup {
  image: StoredImage | null;
  share: StoredImage | null;
}

/**
 * Records the previews rendered for the product's placed artwork, keyed by
 * print area id, replacing any earlier ones. New previews are unapproved.
 */
export async function generateMockups(
  ctx: OperationContext,
  product: StoreProduct,
  rendered: Record<string, RenderedMockup>,
  /** The colour shown on the canvas; ignored unless an enabled variant has it. */
  requestedColour = "",
): Promise<{ count: number }> {
  const t = await getTranslations({ locale: ctx.locale, namespace: "actions.products" });
  const catalog = await getCatalogProduct(product.catalogProductId);
  if (!catalog) throw new OperationError("conflict", t("supplierMissing"));
  if (product.artworks.length === 0) throw new OperationError("invalid", t("artworkRequired"));

  const colour = product.variants.some((v) => v.enabled && v.colour === requestedColour)
    ? requestedColour
    : (product.variants.find((v) => v.enabled)?.colour ?? catalog.variants[0]?.colour ?? "");
  const mockups: MockupImage[] = [];

  for (const artwork of product.artworks) {
    const area = catalog.printAreas.find((a) => a.id === artwork.printAreaId);
    if (!area) continue;
    const base =
      catalog.mockups.find((m) => m.view === area.view && m.colour === colour) ??
      catalog.mockups.find((m) => m.view === area.view);
    if (!base) continue;

    const preview = rendered[area.id];
    if (!preview?.image) continue;

    mockups.push({
      id: newId("mck"),
      view: area.view,
      url: preview.image.url,
      shareUrl: preview.share?.url ?? null,
      colour: base.colour,
      generatedAt: new Date().toISOString(),
      approved: false,
      approvedBy: null,
      approvedAt: null,
    });
  }

  if (mockups.length === 0) throw new OperationError("invalid", t("noPreview"));

  await updateStoreProduct(product.id, { mockups }, product);
  recordAudit({
    category: "product_import",
    action: "product.mockups_generated",
    summary: `Generated ${mockups.length} mockup${mockups.length === 1 ? "" : "s"} for “${product.name}”`,
    storeId: ctx.store.id,
    agencyId: ctx.store.agencyId,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    entity: "store_product",
    entityId: product.id,
    meta: { views: mockups.map((m) => m.view).join(", ") },
  });
  revalidateAfterArtworkChange(ctx.store, product.id);
  return { count: mockups.length };
}

/**
 * Clears the product's previews and returns it for changes. Clearing the
 * previews of a published product takes it off the storefront —
 * `updateStoreProduct` applies that demotion for every artwork/mockup write.
 */
export async function rejectMockups(ctx: OperationContext, product: StoreProduct): Promise<void> {
  await updateStoreProduct(product.id, { mockups: [] as MockupImage[] }, product);
  recordAudit({
    category: "publishing",
    action: "product.mockups_rejected",
    summary: `Rejected the generated mockups for “${product.name}” and returned it for changes`,
    storeId: ctx.store.id,
    agencyId: ctx.store.agencyId,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    entity: "store_product",
    entityId: product.id,
    meta: {},
  });
  revalidateAfterArtworkChange(ctx.store, product.id);
}
