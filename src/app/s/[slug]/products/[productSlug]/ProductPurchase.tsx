"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { addToCart } from "@/app/actions/shop";
import { CheckIcon } from "lucide-react";
import { ActionForm } from "@/components/forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { placementBox } from "@/lib/artwork";
import {
  canPreview,
  fileTooLargeIssue,
  shopperAccept,
  shopperArtworkIssues,
  shopperFormats,
  unreadableFormatIssue,
  type ShopperArtworkIssue,
} from "@/lib/artwork-shopper";
import { fmt, type StorefrontCopy } from "@/lib/i18n";
import { renderMockup, type MockupLayer } from "@/lib/mockup-render";
import { appendStoredImage, uploadImage } from "@/lib/upload-client";
import {
  DEFAULT_PLACEMENT,
  type Artwork,
  type ArtworkPlacement,
  type FileRequirements,
  type PrintArea,
  type StoredImage,
  type StoreProduct,
} from "@/lib/types";
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
  mockups: { id: string; url: string; view: string; colour: string }[];
  shopperCustomization: StoreProduct["shopperCustomization"];
  printArea: PrintArea | null;
  fileRules: FileRequirements | null;
  storeSlug: string;
  /** BCP-47 tag the price is formatted for. */
  localeTag: string;
  /** The store language's copy for this form. */
  t: StorefrontCopy["purchase"];
  /** The store language's wording for the supplier pre-flight. */
  artworkCopy: StorefrontCopy["artwork"];
}

export function ProductPurchase({ product }: { product: PurchaseProduct }) {
  const t = product.t;
  const colours = [...new Set(product.variants.map((v) => v.colour))];
  const [colour, setColour] = useState(colours[0] ?? "");
  const sizes = product.variants.filter((v) => v.colour === colour);
  const [variantId, setVariantId] = useState(sizes[0]?.id ?? product.variants[0]?.id ?? "");
  const [text, setText] = useState("");
  const [artworkPreview, setArtworkPreview] = useState<string | null>(null);
  const [artwork, setArtwork] = useState<StoredImage | null>(null);
  const [artworkStatus, setArtworkStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [artworkError, setArtworkError] = useState<string | null>(null);
  /** Refusals decided before the bytes were sent — format, size, unreadable file. */
  const [fileIssues, setFileIssues] = useState<ShopperArtworkIssue[]>([]);
  const [placement, setPlacement] = useState<ArtworkPlacement>(DEFAULT_PLACEMENT);
  const [activeView, setActiveView] = useState(product.mockups[0]?.view ?? null);
  // The photography for the chosen colour, keeping the view the shopper was on.
  // Mockups shot in a colour the product does not sell fall back to the lot.
  const colourMockups = product.mockups.filter((m) => m.colour === colour);
  const gallery = colourMockups.length > 0 ? colourMockups : product.mockups;
  const activeMockup = (gallery.find((m) => m.view === activeView) ?? gallery[0])?.url ?? null;
  const objectUrl = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  /** Switches colour, keeping the shopper's size where the new colour has it. */
  function selectColour(option: string) {
    setColour(option);
    const size = product.variants.find((v) => v.id === variantId)?.size;
    const next =
      product.variants.find((v) => v.colour === option && v.size === size) ??
      product.variants.find((v) => v.colour === option);
    if (next) setVariantId(next.id);
  }

  useEffect(
    () => () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );

  const variant = product.variants.find((v) => v.id === variantId) ?? product.variants[0];
  const area = product.printArea;
  const rules = product.fileRules;

  /**
   * The artwork as the supplier will receive it: the stored file plus the
   * placement the shopper is looking at. Everything below — the preview, the
   * DPI reading, the pre-flight — is derived from this one object, so they can
   * never disagree with each other.
   */
  const liveArtwork: Artwork | null =
    artwork && area
      ? {
          id: "shopper",
          printAreaId: area.id,
          view: area.view,
          fileName: artwork.fileName,
          url: artwork.url,
          mimeType: artwork.mimeType,
          sizeBytes: artwork.sizeBytes,
          pixelWidth: artwork.pixelWidth,
          pixelHeight: artwork.pixelHeight,
          hasAlpha: artwork.hasAlpha,
          ...placement,
        }
      : null;

  // Cheap enough to redo on every render, which is what keeps the reading
  // honest while the artwork is being dragged.
  const issues: ShopperArtworkIssue[] =
    fileIssues.length > 0
      ? fileIssues
      : liveArtwork && area && rules
        ? shopperArtworkIssues(liveArtwork, area, rules, product.artworkCopy)
        : [];

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const box = liveArtwork && area ? placementBox(liveArtwork, area) : null;
  const requiredDpi = area && rules ? Math.max(area.minDpi, rules.minDpi) : 0;
  const blocked = errors.length > 0;

  function movePlacement(patch: Partial<ArtworkPlacement>) {
    setPlacement((prev) => ({ ...prev, ...patch }));
  }

  function clearArtwork() {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
    if (fileInput.current) fileInput.current.value = "";
    setArtwork(null);
    setArtworkPreview(null);
    setArtworkError(null);
    setFileIssues([]);
    setArtworkStatus("idle");
    setPlacement(DEFAULT_PLACEMENT);
  }

  /**
   * The artwork is stored as soon as it is chosen. Posting the file with the
   * add-to-basket action instead would hit the 1 MB Server Action body cap and
   * fail as a server error the form could not report.
   *
   * The supplier's own rules are applied here too, not only the file size: a
   * 200 × 200 px logo on a 200 mm print area is 25 DPI, and the shopper has to
   * be told that while they can still do something about it.
   */
  async function onArtworkChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
    setArtwork(null);
    setArtworkError(null);
    setFileIssues([]);
    setPlacement(DEFAULT_PLACEMENT);

    if (!file) {
      setArtworkPreview(null);
      setArtworkStatus("idle");
      return;
    }

    // Checks that need no upload run first, so a file that can never work does
    // not cost the shopper a round trip before it is refused.
    if (rules) {
      if (!canPreview(file.type)) {
        setArtworkPreview(null);
        setArtworkStatus("idle");
        setFileIssues([unreadableFormatIssue(file.type, rules, product.artworkCopy)]);
        return;
      }
      if (file.size > rules.maxFileMb * 1024 * 1024) {
        setArtworkPreview(null);
        setArtworkStatus("idle");
        setFileIssues([fileTooLargeIssue(file.size, rules, product.artworkCopy)]);
        return;
      }
    }

    const url = URL.createObjectURL(file);
    objectUrl.current = url;
    setArtworkPreview(url);

    setArtworkStatus("uploading");
    try {
      // The stored metadata — real pixel dimensions and whether the file has an
      // alpha channel — is what the resolution and transparency checks need.
      const stored = await uploadImage(file, "shopperArtwork", {
        storeId: product.storeId,
        productId: product.id,
      });
      setArtwork(stored);
      setArtworkStatus("idle");
    } catch (error) {
      setArtworkStatus("error");
      setArtworkError(error instanceof Error ? error.message : t.uploadFailed);
    }
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!liveArtwork || !area) return;
    dragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: placement.x,
      originY: placement.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const state = dragState.current;
    if (!state || !area) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const areaW = rect.width * area.rect.w;
    const areaH = rect.height * area.rect.h;
    movePlacement({
      x: Math.max(-0.5, Math.min(1.5, state.originX + (event.clientX - state.startX) / areaW)),
      y: Math.max(-0.5, Math.min(1.5, state.originY + (event.clientY - state.startY) / areaH)),
    });
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (dragState.current?.pointerId === event.pointerId) dragState.current = null;
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!liveArtwork) return;
    const step = event.shiftKey ? 0.05 : 0.01;
    const moves: Record<string, Partial<ArtworkPlacement>> = {
      ArrowLeft: { x: placement.x - step },
      ArrowRight: { x: placement.x + step },
      ArrowUp: { y: placement.y - step },
      ArrowDown: { y: placement.y + step },
      "+": { scale: Math.min(2, placement.scale + step) },
      "=": { scale: Math.min(2, placement.scale + step) },
      "-": { scale: Math.max(0.05, placement.scale - step) },
    };
    const patch = moves[event.key];
    if (patch) {
      event.preventDefault();
      movePlacement(patch);
    }
  }

  /**
   * Composites the personalisation onto the product photography and attaches it
   * to the submission, so the basket and the production job carry the same
   * picture the shopper just approved — at the placement they approved it in.
   */
  async function renderPreview(formData: FormData) {
    if (artwork) appendStoredImage(formData, "artwork", artwork);
    if (!area || !activeMockup || (!artwork && !text)) return;
    const layers: MockupLayer[] = [];
    if (artwork && artworkPreview) {
      layers.push({
        artworkUrl: artworkPreview,
        pixelWidth: artwork.pixelWidth,
        pixelHeight: artwork.pixelHeight,
        ...placement,
      });
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
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-14">
      <div className="lg:sticky lg:top-24 lg:self-start">
        {/* The gallery frame stays square: the print-area rectangle and the
            artwork on top of it are positioned as fractions of the product
            photograph, so cropping the photograph to another ratio would move
            the personalisation away from where it will actually print. */}
        <div className="overflow-hidden rounded-card bg-secondary ring-1 ring-line">
          <div ref={canvasRef} className="relative" style={{ aspectRatio: "1 / 1" }}>
            {activeMockup ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={activeMockup}
                alt={fmt(t.previewAlt, { name: product.name })}
                className="h-full w-full select-none object-cover"
                draggable={false}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted">{t.noPreview}</div>
            )}
            {area && artworkPreview ? (
              <div
                aria-hidden
                className={classNames(
                  "pointer-events-none absolute rounded-sm border-2 border-dashed",
                  blocked ? "border-rose-500/70" : "border-primary/70",
                )}
                style={{
                  left: `${area.rect.x * 100}%`,
                  top: `${area.rect.y * 100}%`,
                  width: `${area.rect.w * 100}%`,
                  height: `${area.rect.h * 100}%`,
                }}
              />
            ) : null}
            {area && (artworkPreview || text) ? (
              <div
                className="absolute"
                style={{
                  left: `${area.rect.x * 100}%`,
                  top: `${area.rect.y * 100}%`,
                  width: `${area.rect.w * 100}%`,
                  height: `${area.rect.h * 100}%`,
                }}
              >
                {artworkPreview ? (
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={fmt(t.artworkGrabLabel, { file: artwork?.fileName ?? "" })}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    onKeyDown={onKeyDown}
                    className="absolute cursor-move touch-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    style={{
                      left: `${placement.x * 100}%`,
                      top: `${placement.y * 100}%`,
                      width: `${placement.scale * 100}%`,
                      transform: `translate(-50%, -50%) rotate(${placement.rotation}deg)`,
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={artworkPreview}
                      alt=""
                      className="pointer-events-none block w-full select-none"
                      draggable={false}
                    />
                  </div>
                ) : null}
                {text ? (
                  <span
                    className="pointer-events-none absolute top-[86%] left-1/2 -translate-x-1/2 -translate-y-1/2 text-[3.2cqw] font-bold whitespace-nowrap"
                    style={{ color: variant?.colourHex === "#ffffff" ? "#111827" : "#f8fafc" }}
                  >
                    {text}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {gallery.length > 1 ? (
          <ul className="mt-3 flex gap-2">
            {gallery.map((mockup) => (
              <li key={mockup.id}>
                <button
                  type="button"
                  onClick={() => setActiveView(mockup.view)}
                  aria-pressed={activeMockup === mockup.url}
                  className={classNames(
                    "overflow-hidden rounded-md ring-1 transition",
                    activeMockup === mockup.url ? "ring-2 ring-primary" : "ring-line hover:ring-ink/25",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={mockup.url}
                    alt={fmt(t.viewAlt, { view: mockup.view })}
                    className="h-16 w-16 object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {artworkPreview || text ? (
          <p className="mt-4 rounded-lg border border-line bg-accent px-3 py-2 text-xs leading-relaxed text-accent-foreground">
            {t.livePreview}
          </p>
        ) : null}
      </div>

      <ActionForm
        action={addToCart}
        beforeSubmit={renderPreview}
        submitLabel={t.addToBasket}
        pendingLabel={t.adding}
        submitClassName="btn-primary flex-1 sm:flex-none sm:min-w-44"
        submitDisabled={artworkStatus !== "idle" || blocked}
        hidden={{ storeId: product.storeId, productId: product.id }}
        // Pinned to the bottom of a phone viewport: the picker, the
        // personalisation and the pre-flight are taller than one screen, so the
        // one control that commits the configuration has to stay reachable.
        actionsClassName={classNames(
          "mt-7 flex flex-wrap items-center gap-3",
          "max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-40 max-lg:mt-0 max-lg:border-t",
          "max-lg:border-line max-lg:bg-background/95 max-lg:px-4 max-lg:py-3 max-lg:backdrop-blur",
        )}
        footer={
          <Button asChild variant="outline">
            <Link href={`/s/${product.storeSlug}/cart`}>{t.viewBasket}</Link>
          </Button>
        }
      >
        {(state) => (
          <>
            <input type="hidden" name="variantId" value={variantId} />
            {artwork ? (
              <>
                <input type="hidden" name="artworkX" value={placement.x} />
                <input type="hidden" name="artworkY" value={placement.y} />
                <input type="hidden" name="artworkScale" value={placement.scale} />
                <input type="hidden" name="artworkRotation" value={placement.rotation} />
              </>
            ) : null}

            <p className="text-3xl font-semibold tracking-tight tabular-nums text-ink">
              {variant ? formatMoney(variant.price, product.displayCurrency, product.localeTag) : ""}
            </p>

            {colours.length > 1 ? (
              <fieldset className="mt-7">
                <legend className="text-xs font-semibold tracking-wide text-muted uppercase">
                  {t.colour}
                </legend>
                <ToggleGroup
                  type="single"
                  value={colour}
                  onValueChange={(next) => next && selectColour(next)}
                  aria-label={t.colour}
                  className="mt-3"
                >
                  {colours.map((option) => (
                    <ToggleGroupItem key={option} value={option}>
                      <span
                        aria-hidden
                        className="size-4 rounded-full ring-1 ring-ink/15"
                        style={{
                          background:
                            product.variants.find((v) => v.colour === option)?.colourHex ?? "#fff",
                        }}
                      />
                      {option}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </fieldset>
            ) : null}

            <fieldset className="mt-6">
              <legend className="text-xs font-semibold tracking-wide text-muted uppercase">
                {sizes.length > 1 ? t.size : t.option}
                {state.field === "variantId" ? (
                  <span className="ml-2 text-rose-600 normal-case">{t.required}</span>
                ) : null}
              </legend>
              <ToggleGroup
                type="single"
                value={variantId}
                onValueChange={(next) => next && setVariantId(next)}
                aria-label={sizes.length > 1 ? t.size : t.option}
                className="mt-3"
              >
                {sizes.map((option) => (
                  <ToggleGroupItem
                    key={option.id}
                    value={option.id}
                    disabled={option.availability === "out_of_stock"}
                  >
                    {option.size || option.name}
                    {option.availability === "low_stock" ? (
                      <span className="text-xs text-amber-700">{t.lowStock}</span>
                    ) : null}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </fieldset>

            <div className="mt-6 max-w-[7rem]">
              <Label htmlFor="quantity" className="text-xs font-semibold tracking-wide text-muted uppercase">
                {t.quantity}
              </Label>
              <Input
                id="quantity"
                name="quantity"
                type="number"
                min={1}
                max={50}
                defaultValue={1}
                className="mt-2 tabular-nums"
              />
            </div>

            {product.shopperCustomization.textLine ? (
              <div className="mt-6">
                <Label htmlFor="text">{product.shopperCustomization.textLabel}</Label>
                <Input
                  id="text"
                  name="text"
                  value={text}
                  maxLength={product.shopperCustomization.maxTextLength}
                  onChange={(e) => setText(e.currentTarget.value)}
                  placeholder={t.textPlaceholder}
                  aria-invalid={state.field === "text" ? true : undefined}
                  aria-describedby="text-hint"
                  className="mt-2"
                />
                <p id="text-hint" className="field-hint">
                  {fmt(t.textCounter, {
                    count: text.length,
                    max: product.shopperCustomization.maxTextLength,
                  })}
                </p>
              </div>
            ) : null}

            {product.shopperCustomization.artworkUpload ? (
              <div className="mt-6">
                <Label htmlFor="artwork">{t.artworkLabel}</Label>
                <Input
                  id="artwork"
                  ref={fileInput}
                  type="file"
                  accept={rules ? shopperAccept(rules) : "image/png,image/jpeg,image/webp"}
                  onChange={onArtworkChange}
                  aria-invalid={
                    state.field === "artwork" || artworkStatus === "error" || blocked ? true : undefined
                  }
                  aria-describedby="artwork-hint"
                  className={classNames("mt-2 h-auto py-1.5", artworkStatus === "uploading" && "opacity-60")}
                />
                <p id="artwork-hint" className="field-hint">
                  {area && rules
                    ? fmt(t.artworkHint, {
                        width: area.widthMm,
                        height: area.heightMm,
                        dpi: requiredDpi,
                        formats: shopperFormats(rules).join(", "),
                        max: rules.maxFileMb,
                      })
                    : t.artworkHintSimple}
                </p>
                <p role="status" aria-live="polite" className="mt-2">
                  {artworkStatus === "uploading" ? (
                    <span className="text-sm text-muted">{t.uploading}</span>
                  ) : artworkError ? (
                    <span className="text-sm text-rose-700">{artworkError}</span>
                  ) : artwork ? (
                    <Badge>{artwork.fileName}</Badge>
                  ) : null}
                </p>

                {liveArtwork && area && box ? (
                  <Card className="mt-4 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-ink">{t.artworkPlacementTitle}</h3>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-rose-700"
                        onClick={clearArtwork}
                      >
                        {t.artworkRemove}
                      </Button>
                    </div>
                    <p className="mt-1 text-xs text-muted">{t.artworkPlacementHelp}</p>

                    <div className="mt-4 space-y-3.5">
                      <div>
                        <label
                          htmlFor="artwork-scale"
                          className="flex items-center justify-between text-xs font-medium text-ink"
                        >
                          <span>{t.artworkSize}</span>
                          <span className="tabular-nums text-muted">
                            {Math.round(box.printedWidthMm)} × {Math.round(box.printedHeightMm)} mm
                          </span>
                        </label>
                        <input
                          id="artwork-scale"
                          type="range"
                          min={5}
                          max={200}
                          step={1}
                          value={Math.round(placement.scale * 100)}
                          onChange={(e) => movePlacement({ scale: Number(e.currentTarget.value) / 100 })}
                          className="mt-1.5 w-full accent-primary"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="artwork-rotation"
                          className="flex items-center justify-between text-xs font-medium text-ink"
                        >
                          <span>{t.artworkRotation}</span>
                          <span className="tabular-nums text-muted">{placement.rotation}°</span>
                        </label>
                        <input
                          id="artwork-rotation"
                          type="range"
                          min={-180}
                          max={180}
                          step={1}
                          value={placement.rotation}
                          onChange={(e) => movePlacement({ rotation: Number(e.currentTarget.value) })}
                          className="mt-1.5 w-full accent-primary"
                        />
                      </div>
                      <div className="flex items-center justify-between rounded-lg bg-secondary px-3 py-2 text-xs">
                        <span className="text-muted">{t.artworkResolution}</span>
                        <span
                          className={classNames(
                            "font-semibold tabular-nums",
                            box.effectiveDpi >= requiredDpi ? "text-emerald-700" : "text-rose-700",
                          )}
                        >
                          {Math.round(box.effectiveDpi)} DPI
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        // Position only: a shopper who has found the right size
                        // should not lose it by nudging the artwork back.
                        onClick={() => movePlacement({ x: DEFAULT_PLACEMENT.x, y: DEFAULT_PLACEMENT.y })}
                      >
                        {t.artworkRecentre}
                      </Button>
                    </div>
                  </Card>
                ) : null}

                {errors.length > 0 ? (
                  <div className="mt-4" role="alert">
                    <p className="text-sm font-semibold text-rose-900">{t.artworkChecksFail}</p>
                    <ul className="mt-2 space-y-2.5">
                      {errors.map((issue) => (
                        <li key={issue.code} className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                          <p className="text-sm font-medium text-rose-900">{issue.message}</p>
                          <p className="mt-1 text-xs text-rose-800">
                            {fmt(t.artworkWhatToDo, { fix: issue.fix })}
                          </p>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs text-rose-800">{t.artworkBlocked}</p>
                    {!liveArtwork ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mt-1 text-rose-700"
                        onClick={clearArtwork}
                      >
                        {t.artworkRemove}
                      </Button>
                    ) : null}
                  </div>
                ) : null}

                {warnings.length > 0 ? (
                  <ul className="mt-3 space-y-2.5">
                    {warnings.map((issue) => (
                      <li key={issue.code} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                        <p className="text-sm font-medium text-amber-900">{issue.message}</p>
                        <p className="mt-1 text-xs text-amber-800">{issue.fix}</p>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {liveArtwork && errors.length === 0 && warnings.length === 0 ? (
                  <p className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                    <CheckIcon aria-hidden className="size-4 shrink-0" />
                    {t.artworkChecksPass}
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </ActionForm>
    </div>
  );
}
