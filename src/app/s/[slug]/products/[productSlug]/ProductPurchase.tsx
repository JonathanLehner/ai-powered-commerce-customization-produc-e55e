"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { addToCart } from "@/app/actions/shop";
import { ActionForm } from "@/components/forms";
import { Badge } from "@/components/ui";
import { renderMockup, type MockupLayer } from "@/lib/mockup-render";
import { appendStoredImage, uploadImage } from "@/lib/upload-client";
import type { StoredImage, StoreProduct } from "@/lib/types";
import { classNames, formatMoney } from "@/lib/util";

export interface PurchaseProduct {
  id: string;
  storeId: string;
  name: string;
  currency: string;
  displayCurrency: string;
  variants: {
    id: string;
    name: string;
    colour: string;
    colourHex: string;
    size: string;
    price: number;
    availability: string;
  }[];
  mockups: { id: string; url: string; view: string }[];
  shopperCustomization: StoreProduct["shopperCustomization"];
  printArea: { name: string; widthMm: number; heightMm: number; minDpi: number; rect: { x: number; y: number; w: number; h: number } } | null;
  fileRules: { formats: string[]; maxFileMb: number; minDpi: number } | null;
  storeSlug: string;
}

export function ProductPurchase({ product }: { product: PurchaseProduct }) {
  const colours = [...new Set(product.variants.map((v) => v.colour))];
  const [colour, setColour] = useState(colours[0] ?? "");
  const sizes = product.variants.filter((v) => v.colour === colour);
  const [variantId, setVariantId] = useState(sizes[0]?.id ?? product.variants[0]?.id ?? "");
  const [text, setText] = useState("");
  const [artworkPreview, setArtworkPreview] = useState<string | null>(null);
  const [artwork, setArtwork] = useState<StoredImage | null>(null);
  const [artworkStatus, setArtworkStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [artworkError, setArtworkError] = useState<string | null>(null);
  const [activeMockup, setActiveMockup] = useState(product.mockups[0]?.url ?? null);
  const objectUrl = useRef<string | null>(null);

  useEffect(() => {
    const next = product.variants.find((v) => v.colour === colour);
    if (next && !product.variants.some((v) => v.id === variantId && v.colour === colour)) {
      setVariantId(next.id);
    }
  }, [colour, product.variants, variantId]);

  useEffect(
    () => () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );

  const variant = product.variants.find((v) => v.id === variantId) ?? product.variants[0];

  /**
   * The artwork is stored as soon as it is chosen. Posting the file with the
   * add-to-basket action instead would hit the 1 MB Server Action body cap and
   * fail as a server error the form could not report.
   */
  async function onArtworkChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
    setArtwork(null);
    setArtworkError(null);

    if (!file) {
      setArtworkPreview(null);
      setArtworkStatus("idle");
      return;
    }

    const url = URL.createObjectURL(file);
    objectUrl.current = url;
    setArtworkPreview(url);

    const limitMb = product.fileRules?.maxFileMb;
    if (limitMb && file.size > limitMb * 1024 * 1024) {
      setArtworkStatus("error");
      setArtworkError(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${limitMb} MB.`);
      return;
    }

    setArtworkStatus("uploading");
    try {
      const stored = await uploadImage(file, "shopperArtwork", {
        storeId: product.storeId,
        productId: product.id,
      });
      setArtwork(stored);
      setArtworkStatus("idle");
    } catch (error) {
      setArtworkStatus("error");
      setArtworkError(error instanceof Error ? error.message : "That file could not be uploaded.");
    }
  }

  const area = product.printArea;

  /**
   * Composites the personalisation onto the product photography and attaches it
   * to the submission, so the basket and the production job carry the same
   * picture the shopper just approved.
   */
  async function renderPreview(formData: FormData) {
    if (artwork) appendStoredImage(formData, "artwork", artwork);
    if (!area || !activeMockup || (!artwork && !text)) return;
    const layers: MockupLayer[] = [];
    if (artworkPreview) {
      layers.push({ artworkUrl: artworkPreview, x: 0.5, y: 0.5, scale: 0.6, rotation: 0 });
    }
    if (text) {
      layers.push({
        x: 0.5,
        y: 0.86,
        scale: 0.8,
        rotation: 0,
        text,
        textColour: variant?.colourHex === "#ffffff" ? "#111827" : "#f8fafc",
      });
    }
    const blob = await renderMockup(activeMockup, area.rect, layers);
    const stored = await uploadImage(
      new File([blob], "preview.webp", { type: blob.type || "image/webp" }),
      "shopperPreview",
      { storeId: product.storeId, productId: product.id },
    );
    appendStoredImage(formData, "preview", stored);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div>
        <div className="overflow-hidden rounded-xl border border-line bg-canvas">
          <div className="relative" style={{ aspectRatio: "1 / 1" }}>
            {activeMockup ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={activeMockup} alt={`${product.name} preview`} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted">No preview available</div>
            )}
            {area && (artworkPreview || text) ? (
              <div
                className="pointer-events-none absolute"
                style={{
                  left: `${area.rect.x * 100}%`,
                  top: `${area.rect.y * 100}%`,
                  width: `${area.rect.w * 100}%`,
                  height: `${area.rect.h * 100}%`,
                }}
              >
                {artworkPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={artworkPreview}
                    alt=""
                    className="absolute left-1/2 top-1/2 w-[60%] -translate-x-1/2 -translate-y-1/2"
                  />
                ) : null}
                {text ? (
                  <span
                    className="absolute left-1/2 top-[86%] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[3.2cqw] font-bold"
                    style={{ color: variant?.colourHex === "#ffffff" ? "#111827" : "#f8fafc" }}
                  >
                    {text}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {product.mockups.length > 1 ? (
          <ul className="mt-3 flex gap-2">
            {product.mockups.map((mockup) => (
              <li key={mockup.id}>
                <button
                  type="button"
                  onClick={() => setActiveMockup(mockup.url)}
                  aria-pressed={activeMockup === mockup.url}
                  className={classNames(
                    "overflow-hidden rounded-lg border-2",
                    activeMockup === mockup.url ? "border-brand-500" : "border-line",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mockup.url} alt={`${mockup.view} view`} className="h-16 w-16 object-cover" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {artworkPreview || text ? (
          <p className="mt-3 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-800">
            Live preview. A production-accurate version is attached when you add this to the basket.
          </p>
        ) : null}
      </div>

      <ActionForm
        action={addToCart}
        beforeSubmit={renderPreview}
        submitLabel="Add to basket"
        pendingLabel="Adding…"
        submitDisabled={artworkStatus !== "idle"}
        hidden={{ storeId: product.storeId, productId: product.id }}
        footer={
          <Link href={`/s/${product.storeSlug}/cart`} className="btn-secondary">
            View basket
          </Link>
        }
      >
        {(state) => (
          <>
            <input type="hidden" name="variantId" value={variantId} />

            <p className="text-2xl font-semibold tabular-nums text-ink">
              {variant ? formatMoney(variant.price, product.displayCurrency) : ""}
            </p>

            {colours.length > 1 ? (
              <fieldset className="mt-5">
                <legend className="field-label">Colour</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {colours.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setColour(option)}
                      aria-pressed={colour === option}
                      className={classNames(
                        "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                        colour === option ? "border-brand-500 bg-brand-50" : "border-line hover:bg-canvas",
                      )}
                    >
                      <span
                        aria-hidden
                        className="h-4 w-4 rounded-full border border-line"
                        style={{
                          background: product.variants.find((v) => v.colour === option)?.colourHex ?? "#fff",
                        }}
                      />
                      {option}
                    </button>
                  ))}
                </div>
              </fieldset>
            ) : null}

            <fieldset className="mt-5">
              <legend className="field-label">
                {sizes.length > 1 ? "Size" : "Option"}
                {state.field === "variantId" ? <span className="ml-2 text-xs text-rose-600">Required</span> : null}
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {sizes.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setVariantId(option.id)}
                    aria-pressed={variantId === option.id}
                    disabled={option.availability === "out_of_stock"}
                    className={classNames(
                      "rounded-lg border px-3.5 py-2 text-sm",
                      variantId === option.id ? "border-brand-500 bg-brand-50 font-medium" : "border-line hover:bg-canvas",
                      option.availability === "out_of_stock" && "cursor-not-allowed opacity-50",
                    )}
                  >
                    {option.size || option.name}
                    {option.availability === "low_stock" ? (
                      <span className="ml-1.5 text-xs text-amber-700">low</span>
                    ) : null}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="mt-5 max-w-[8rem]">
              <label htmlFor="quantity" className="field-label">
                Quantity
              </label>
              <input
                id="quantity"
                name="quantity"
                type="number"
                min={1}
                max={50}
                defaultValue={1}
                className="input"
              />
            </div>

            {product.shopperCustomization.textLine ? (
              <div className="mt-5">
                <label htmlFor="text" className="field-label">
                  {product.shopperCustomization.textLabel}
                </label>
                <input
                  id="text"
                  name="text"
                  value={text}
                  maxLength={product.shopperCustomization.maxTextLength}
                  onChange={(e) => setText(e.currentTarget.value)}
                  placeholder="Optional"
                  aria-invalid={state.field === "text" ? true : undefined}
                  aria-describedby="text-hint"
                  className={state.field === "text" ? "input input-error" : "input"}
                />
                <p id="text-hint" className="field-hint">
                  {text.length}/{product.shopperCustomization.maxTextLength} characters. Printed with the design.
                </p>
              </div>
            ) : null}

            {product.shopperCustomization.artworkUpload ? (
              <div className="mt-5">
                <label htmlFor="artwork" className="field-label">
                  Your own artwork
                </label>
                <input
                  id="artwork"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={onArtworkChange}
                  aria-invalid={state.field === "artwork" || artworkStatus === "error" ? true : undefined}
                  aria-describedby="artwork-hint"
                  className={classNames(
                    "input file:mr-3 file:rounded-md file:border-0 file:bg-canvas file:px-3 file:py-1.5 file:text-sm",
                    (state.field === "artwork" || artworkStatus === "error") && "input-error",
                    artworkStatus === "uploading" && "opacity-60",
                  )}
                />
                <p id="artwork-hint" className="field-hint">
                  {area && product.fileRules
                    ? `Printed at ${area.widthMm} × ${area.heightMm} mm, so we need at least ${Math.max(area.minDpi, product.fileRules.minDpi)} DPI. ${product.fileRules.formats.join(", ")} up to ${product.fileRules.maxFileMb} MB.`
                    : "PNG, JPG or WEBP."}
                </p>
                <p role="status" aria-live="polite" className="mt-2">
                  {artworkStatus === "uploading" ? (
                    <span className="text-sm text-muted">Uploading your artwork…</span>
                  ) : artworkError ? (
                    <span className="text-sm text-rose-700">{artworkError}</span>
                  ) : artwork ? (
                    <Badge tone="brand">{artwork.fileName}</Badge>
                  ) : null}
                </p>
              </div>
            ) : null}
          </>
        )}
      </ActionForm>
    </div>
  );
}
