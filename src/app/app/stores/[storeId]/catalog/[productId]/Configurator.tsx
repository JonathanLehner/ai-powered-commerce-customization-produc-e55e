"use client";

import { useLocale, useTranslations } from "next-intl";
import { startTransition, useActionState, useMemo, useRef, useState } from "react";
import { attachArtwork, generateMockups, persistPlacement, removeArtwork } from "@/app/actions/products";
import { ActionForm, FormStatus, SubmitButton } from "@/components/forms";
import { Badge } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ActionState } from "@/app/actions/stores";
import { artworkIssueText } from "@/i18n/artwork-copy";
import {
  acceptedFormats,
  acceptedMimeTypes,
  formatOf,
  isAcceptedFormat,
  placementBox,
  requiredDpi,
  validateArtwork,
  type ArtworkIssue,
} from "@/lib/artwork";
import { canvasColours, initialCanvasColour } from "@/lib/canvas-colour";
import { renderMockupWithShareCopy, sameOriginAsset } from "@/lib/mockup-render";
import { appendStoredImage, uploadImage } from "@/lib/upload-client";
import type { Artwork, CatalogProduct, FileRequirements, StoreProduct } from "@/lib/types";
import { classNames } from "@/lib/util";

interface Placement {
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

/**
 * Artwork goes up the moment a file is chosen or dropped — there is no second
 * "upload" click to forget. The file itself is posted to `/api/uploads`, which
 * has no 1 MB Server Action body cap; the action that records it then only
 * carries the returned metadata. Picking and dropping lock while an upload is
 * in flight so a second file cannot race the first.
 */
function useArtworkUpload(storeId: string, productId: string, areaId: string, rules: FileRequirements) {
  const [state, formAction, saving] = useActionState<ActionState, FormData>(attachArtwork, {
    status: "idle",
  });
  const [uploading, setUploading] = useState(false);
  // Errors and results belong to the print area they were raised on.
  const [result, setResult] = useState<{ areaId: string; error: string | null }>({ areaId, error: null });
  const t = useTranslations("configurator");
  const busy = uploading || saving;
  const current = result.areaId === areaId;
  const error = current ? result.error : null;

  async function upload(file: File) {
    if (busy) return;
    const fail = (message: string) => setResult({ areaId, error: message });
    setResult({ areaId, error: null });
    if (!isAcceptedFormat(file.type, rules)) {
      fail(t("badFormat", { format: formatOf(file.type || file.name.split(".").pop() || ""), formats: acceptedFormats(rules).join(", ") }));
      return;
    }
    if (file.size > rules.maxFileMb * 1024 * 1024) {
      fail(t("fileTooLarge", { size: (file.size / 1024 / 1024).toFixed(1), max: rules.maxFileMb }));
      return;
    }

    setUploading(true);
    try {
      const image = await uploadImage(file, "artwork", { storeId, productId });
      const formData = new FormData();
      formData.set("storeId", storeId);
      formData.set("productId", productId);
      formData.set("printAreaId", areaId);
      appendStoredImage(formData, "artwork", image);
      startTransition(() => formAction(formData));
    } catch (error) {
      fail(error instanceof Error ? error.message : t("uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  return {
    upload,
    busy,
    uploading,
    error,
    state: current ? state : ({ status: "idle" } as ActionState),
    invalid: error !== null || (current && state.field === "artwork"),
  };
}

export function Configurator({
  product,
  catalog,
  readOnly,
}: {
  product: StoreProduct;
  catalog: CatalogProduct;
  readOnly: boolean;
}) {
  const [activeAreaId, setActiveAreaId] = useState(catalog.printAreas[0]?.id ?? "");
  const t = useTranslations("configurator");
  const issuesT = useTranslations("artworkIssues");
  const locale = useLocale();
  const issueText = (issue: ArtworkIssue) => artworkIssueText(issuesT, issue, locale);
  const [placements, setPlacements] = useState<Record<string, Placement>>(() =>
    Object.fromEntries(
      product.artworks.map((a) => [a.id, { x: a.x, y: a.y, scale: a.scale, rotation: a.rotation }]),
    ),
  );
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(
    null,
  );

  const area = catalog.printAreas.find((a) => a.id === activeAreaId) ?? catalog.printAreas[0];
  const artwork = product.artworks.find((a) => a.printAreaId === area?.id);
  const placement = artwork ? (placements[artwork.id] ?? { x: artwork.x, y: artwork.y, scale: artwork.scale, rotation: artwork.rotation }) : null;

  const colours = useMemo(() => canvasColours(product, catalog), [product, catalog]);
  const [colour, setColour] = useState(() => initialCanvasColour(product, colours));
  const colourHex = colours.find((c) => c.name === colour)?.hex ?? "";
  const base = useMemo(() => {
    if (!area) return null;
    return (
      catalog.mockups.find((m) => m.view === area.view && m.colour === colour) ??
      catalog.mockups.find((m) => m.view === area.view) ??
      null
    );
  }, [area, catalog.mockups, colour]);
  // No photograph in this colour: tint the nearest one so the garment still reads right.
  const tint = base && base.colour !== colour && colourHex ? colourHex : null;

  const uploader = useArtworkUpload(product.storeId, product.id, area?.id ?? "", catalog.fileRequirements);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const formats = acceptedFormats(catalog.fileRequirements).join(", ");

  function onFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    // Clearing the input straight away means picking the same file again still
    // fires a change event.
    event.currentTarget.value = "";
    if (file) void uploader.upload(file);
  }

  function onDrop(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void uploader.upload(file);
  }

  const liveArtwork: Artwork | null =
    artwork && placement ? { ...artwork, ...placement } : null;

  const issues: ArtworkIssue[] =
    liveArtwork && area ? validateArtwork(liveArtwork, area, catalog.fileRequirements) : [];
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const box = liveArtwork && area ? placementBox(liveArtwork, area) : null;

  const dirty =
    artwork && placement
      ? placement.x !== artwork.x ||
        placement.y !== artwork.y ||
        placement.scale !== artwork.scale ||
        placement.rotation !== artwork.rotation
      : false;

  function update(id: string, patch: Partial<Placement>) {
    setPlacements((prev) => {
      const current = prev[id] ?? { x: 0.5, y: 0.5, scale: 0.6, rotation: 0 };
      return { ...prev, [id]: { ...current, ...patch } };
    });
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!artwork || !placement || readOnly) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !area) return;
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
    if (!state || !artwork || !area) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const areaW = rect.width * area.rect.w;
    const areaH = rect.height * area.rect.h;
    const dx = (event.clientX - state.startX) / areaW;
    const dy = (event.clientY - state.startY) / areaH;
    update(artwork.id, {
      x: Math.max(-0.5, Math.min(1.5, state.originX + dx)),
      y: Math.max(-0.5, Math.min(1.5, state.originY + dy)),
    });
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (dragState.current?.pointerId === event.pointerId) dragState.current = null;
  }

  /**
   * Composites the saved placement onto the supplier photography for every
   * decorated view. Rendering happens here because the server has no image
   * toolchain; each preview is stored through the upload route and only its URL
   * goes on the form.
   *
   * The views are rendered and uploaded together rather than one after another:
   * done in sequence, a three-area product waited for three full render-and-
   * upload cycles before the form was even submitted.
   */
  async function renderMockups(formData: FormData) {
    const jobs = product.artworks.flatMap((artwork) => {
      const target = catalog.printAreas.find((a) => a.id === artwork.printAreaId);
      if (!target) return [];
      const photo =
        catalog.mockups.find((m) => m.view === target.view && m.colour === colour) ??
        catalog.mockups.find((m) => m.view === target.view);
      if (!photo) return [];
      return [{ artwork, target, photo }];
    });

    // A view that cannot be drawn must not take the others down with it — the
    // action reports whichever previews did render.
    const rendered = await Promise.allSettled(
      jobs.map(async ({ artwork, target, photo }) => {
        const { preview, share } = await renderMockupWithShareCopy(photo.url, target.rect, [
          {
            artworkUrl: artwork.url,
            pixelWidth: artwork.pixelWidth,
            pixelHeight: artwork.pixelHeight,
            x: artwork.x,
            y: artwork.y,
            scale: artwork.scale,
            rotation: artwork.rotation,
          },
        ]);
        const context = { storeId: product.storeId, productId: product.id };
        const [stored, shareCopy] = await Promise.all([
          uploadImage(new File([preview], `${target.id}.webp`, { type: preview.type || "image/webp" }), "mockup", context),
          // Only link previews read the copy, so a failed upload leaves the preview standing.
          uploadImage(new File([share], `${target.id}-share.jpg`, { type: "image/jpeg" }), "mockup", context).catch(
            () => null,
          ),
        ]);
        return { areaId: target.id, stored, shareCopy };
      }),
    );

    for (const result of rendered) {
      if (result.status !== "fulfilled") continue;
      appendStoredImage(formData, `mockup_${result.value.areaId}`, result.value.stored);
      if (result.value.shareCopy) {
        appendStoredImage(formData, `mockupShare_${result.value.areaId}`, result.value.shareCopy);
      }
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!artwork || !placement || readOnly) return;
    const step = event.shiftKey ? 0.05 : 0.01;
    const moves: Record<string, Partial<Placement>> = {
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
      update(artwork.id, patch);
    }
  }

  if (!area || !base) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("noPrintAreas")}
      </p>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,40rem)_22rem]">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          type="single"
          variant="outline"
          aria-label={t("printAreas")}
          value={area.id}
          // A print area is always being edited, so an empty value is ignored
          // rather than letting the canvas lose its subject.
          onValueChange={(next) => next && setActiveAreaId(next)}
          className="flex-wrap"
        >
          {catalog.printAreas.map((a) => {
            const hasArt = product.artworks.some((art) => art.printAreaId === a.id);
            return (
              <ToggleGroupItem key={a.id} value={a.id}>
                {a.name}
                {hasArt ? <span className="ml-1.5 text-xs text-emerald-600">●</span> : null}
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
        {colours.length > 1 ? (
          <ToggleGroup
            type="single"
            variant="outline"
            aria-label={t("colour")}
            value={colour}
            onValueChange={(next) => next && setColour(next)}
            className="flex-wrap"
          >
            {colours.map((c) => (
              <ToggleGroupItem key={c.name} value={c.name}>
                <span
                  aria-hidden
                  className="size-3 rounded-full border border-black/15"
                  style={{ backgroundColor: c.hex }}
                />
                {c.name}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        ) : null}
        </div>

        <div
          ref={canvasRef}
          className="relative mt-4 aspect-square w-full max-w-160 overflow-hidden rounded-xl border border-border bg-canvas"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={sameOriginAsset(base.url)}
            alt={t("baseAlt", { product: catalog.name, area: area.name, colour: base.colour })}
            className="h-full w-full select-none object-cover"
            draggable={false}
          />
          {tint ? (
            <div aria-hidden className="pointer-events-none absolute inset-0 mix-blend-multiply" style={{ backgroundColor: tint }} />
          ) : null}
          {!liveArtwork && !readOnly ? (
            <button
              type="button"
              disabled={uploader.busy}
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragOver={(e) => e.preventDefault()}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={classNames(
                "absolute flex items-center justify-center rounded-sm border-2 border-dashed p-2 text-center text-xs font-medium text-foreground transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-progress",
                dragOver
                  ? "border-brand-600 bg-brand-50/90"
                  : "border-brand-500/70 bg-background/60 hover:bg-background/80",
              )}
              style={{
                left: `${area.rect.x * 100}%`,
                top: `${area.rect.y * 100}%`,
                width: `${area.rect.w * 100}%`,
                height: `${area.rect.h * 100}%`,
              }}
            >
              {uploader.uploading ? (
                t("uploading")
              ) : (
                <span>
                  {t.rich("dropHere", {
                    formats,
                    browse: (chunks) => <span className="text-brand-700 underline underline-offset-2">{chunks}</span>,
                  })}
                </span>
              )}
            </button>
          ) : (
            <div
              aria-hidden
              className="pointer-events-none absolute rounded-sm border-2 border-dashed border-brand-500/70"
              style={{
                left: `${area.rect.x * 100}%`,
                top: `${area.rect.y * 100}%`,
                width: `${area.rect.w * 100}%`,
                height: `${area.rect.h * 100}%`,
              }}
            />
          )}
          {liveArtwork && placement ? (
            <div
              className="absolute"
              style={{
                left: `${area.rect.x * 100}%`,
                top: `${area.rect.y * 100}%`,
                width: `${area.rect.w * 100}%`,
                height: `${area.rect.h * 100}%`,
              }}
            >
              <div
                role="button"
                tabIndex={0}
                aria-label={t("placementLabel", { file: liveArtwork.fileName })}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={onKeyDown}
                className={classNames(
                  "absolute touch-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
                  readOnly ? "cursor-default" : "cursor-move",
                )}
                style={{
                  left: `${placement.x * 100}%`,
                  top: `${placement.y * 100}%`,
                  width: `${placement.scale * 100}%`,
                  transform: `translate(-50%, -50%) rotate(${placement.rotation}deg)`,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={sameOriginAsset(liveArtwork.url)}
                  alt=""
                  className="pointer-events-none block w-full select-none"
                  draggable={false}
                />
              </div>
            </div>
          ) : null}
        </div>

        <p className="mt-2 text-xs text-muted-foreground">
          {t("printArea", { width: area.widthMm, height: area.heightMm, dpi: area.minDpi })}
        </p>
      </div>

      <div className="space-y-5">
        {artwork && placement ? (
          <>
            <Card size="sm">
              <CardContent>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{artwork.fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className="tabular-nums">
                      {artwork.pixelWidth} × {artwork.pixelHeight} px
                    </span>{" "}
                    · <span className="tabular-nums">{(artwork.sizeBytes / 1024).toFixed(0)} KB</span> ·{" "}
                    {artwork.hasAlpha ? t("transparent") : t("opaque")}
                  </p>
                </div>
                {!readOnly ? (
                  <form action={removeArtwork}>
                    <input type="hidden" name="storeId" value={product.storeId} />
                    <input type="hidden" name="productId" value={product.id} />
                    <input type="hidden" name="artworkId" value={artwork.id} />
                    <Button type="submit" variant="ghost" size="sm" className="text-rose-700">
                      {t("remove")}
                    </Button>
                  </form>
                ) : null}
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <Label htmlFor="scale" className="flex items-center justify-between text-xs">
                    <span>{t("size")}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {box ? `${Math.round(box.printedWidthMm)} × ${Math.round(box.printedHeightMm)} mm` : ""}
                    </span>
                  </Label>
                  <input
                    id="scale"
                    type="range"
                    min={5}
                    max={200}
                    step={1}
                    disabled={readOnly}
                    value={Math.round(placement.scale * 100)}
                    onChange={(e) => update(artwork.id, { scale: Number(e.currentTarget.value) / 100 })}
                    className="mt-1 w-full accent-brand-600"
                  />
                </div>
                <div>
                  <Label htmlFor="rotation" className="flex items-center justify-between text-xs">
                    <span>{t("rotation")}</span>
                    <span className="tabular-nums text-muted-foreground">{placement.rotation}°</span>
                  </Label>
                  <input
                    id="rotation"
                    type="range"
                    min={-180}
                    max={180}
                    step={1}
                    disabled={readOnly}
                    value={placement.rotation}
                    onChange={(e) => update(artwork.id, { rotation: Number(e.currentTarget.value) })}
                    className="mt-1 w-full accent-brand-600"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="pos-x" className="text-xs">
                      {t("horizontal")}
                    </Label>
                    <Input
                      id="pos-x"
                      type="number"
                      min={-50}
                      max={150}
                      step={1}
                      disabled={readOnly}
                      value={Math.round(placement.x * 100)}
                      onChange={(e) => update(artwork.id, { x: Number(e.currentTarget.value) / 100 })}
                      className="tabular-nums"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="pos-y" className="text-xs">
                      {t("vertical")}
                    </Label>
                    <Input
                      id="pos-y"
                      type="number"
                      min={-50}
                      max={150}
                      step={1}
                      disabled={readOnly}
                      value={Math.round(placement.y * 100)}
                      onChange={(e) => update(artwork.id, { y: Number(e.currentTarget.value) / 100 })}
                      className="tabular-nums"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-canvas px-3 py-2 text-xs">
                  <span className="text-muted-foreground">{t("resolution")}</span>
                  <span
                    className={classNames(
                      "font-semibold tabular-nums",
                      box && box.effectiveDpi >= requiredDpi(area, catalog.fileRequirements)
                        ? "text-emerald-700"
                        : "text-rose-700",
                    )}
                  >
                    {box ? Math.round(box.effectiveDpi) : 0} DPI
                  </span>
                </div>
              </div>

              {!readOnly ? (
                <form action={persistPlacement} className="mt-4">
                  <input type="hidden" name="storeId" value={product.storeId} />
                  <input type="hidden" name="productId" value={product.id} />
                  {product.artworks.map((a) => {
                    const p = placements[a.id] ?? { x: a.x, y: a.y, scale: a.scale, rotation: a.rotation };
                    return (
                      <span key={a.id}>
                        <input type="hidden" name={`x_${a.id}`} value={p.x} />
                        <input type="hidden" name={`y_${a.id}`} value={p.y} />
                        <input type="hidden" name={`scale_${a.id}`} value={p.scale} />
                        <input type="hidden" name={`rotation_${a.id}`} value={p.rotation} />
                      </span>
                    );
                  })}
                  <SubmitButton className="w-full" pendingLabel={t("savingPlacement")}>
                    {dirty ? t("savePlacement") : t("placementSaved")}
                  </SubmitButton>
                </form>
              ) : null}
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle asChild className="text-sm font-semibold">
                  <h3>{t("preflight")}</h3>
                </CardTitle>
              </CardHeader>
              <CardContent>
              {errors.length === 0 && warnings.length === 0 ? (
                <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  {t("passes", { product: catalog.name })}
                </p>
              ) : null}
              {errors.length > 0 ? (
                <div className="mt-2" role="alert">
                  <Badge tone="rose">
                    {t("blocking", { count: errors.length })}
                  </Badge>
                  <ul className="mt-2 space-y-2.5">
                    {errors.map((issue) => (
                      <li key={issue.code} className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                        <p className="text-sm font-medium text-rose-900">{issueText(issue).message}</p>
                        <p className="mt-1 text-xs text-rose-800">
                          {t("howToFix", { fix: issueText(issue).fix })}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {warnings.length > 0 ? (
                <ul className="mt-2 space-y-2.5">
                  {warnings.map((issue) => (
                    <li key={issue.code} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <p className="text-sm font-medium text-amber-900">{issueText(issue).message}</p>
                      <p className="mt-1 text-xs text-amber-800">{issueText(issue).fix}</p>
                    </li>
                  ))}
                </ul>
              ) : null}
              <dl className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                <div className="flex justify-between gap-2">
                  <dt>{t("formats")}</dt>
                  <dd className="text-foreground">{acceptedFormats(catalog.fileRequirements).join(", ")}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>{t("maxSize")}</dt>
                  <dd className="text-foreground">{catalog.fileRequirements.maxFileMb} MB</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>{t("minDpi")}</dt>
                  <dd className="text-foreground">{requiredDpi(area, catalog.fileRequirements)} DPI</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>{t("transparentBackground")}</dt>
                  <dd className="text-foreground">
                    {catalog.fileRequirements.transparentBackgroundRequired ? t("required") : t("optional")}
                  </dd>
                </div>
              </dl>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card size="sm">
            <CardHeader>
              <CardTitle asChild className="text-sm font-semibold">
                <h3>{t("noArtwork", { area: area.name })}</h3>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {t("noArtworkBody")}
              </p>
            </CardHeader>
          </Card>
        )}

        {!readOnly ? (
          <Card size="sm">
            <CardContent className="grid gap-1.5">
              <input
                ref={fileInputRef}
                id="artwork"
                type="file"
                accept={acceptedMimeTypes(catalog.fileRequirements)}
                disabled={uploader.busy}
                onChange={onFileChosen}
                className="sr-only"
                tabIndex={-1}
                aria-hidden
              />
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={uploader.busy}
                onClick={() => fileInputRef.current?.click()}
                aria-label={t("uploadFor", { area: area.name })}
                aria-invalid={uploader.invalid ? true : undefined}
                aria-describedby="artwork-hint"
              >
                {uploader.busy ? (uploader.uploading ? t("uploading") : t("saving")) : t("upload")}
              </Button>
              <p id="artwork-hint" className="text-xs text-muted-foreground">
                {t("fileHint", { formats, max: catalog.fileRequirements.maxFileMb, dpi: requiredDpi(area, catalog.fileRequirements) })}
                {catalog.fileRequirements.transparentBackgroundRequired ? t("needsTransparency") : ""}
              </p>
              {uploader.busy ? (
                <p role="status" aria-live="polite" className="sr-only">
                  {uploader.uploading ? t("uploading") : t("saving")}
                </p>
              ) : uploader.error ? (
                <p
                  role="status"
                  aria-live="polite"
                  className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
                >
                  {uploader.error}
                </p>
              ) : (
                <FormStatus state={uploader.state} />
              )}
            </CardContent>
          </Card>
        ) : null}

        {!readOnly ? (
          <Card size="sm" asChild>
          <ActionForm
            action={generateMockups}
            beforeSubmit={renderMockups}
            submitLabel={t("generate")}
            pendingLabel={t("rendering")}
            submitVariant="secondary" submitClassName="w-full"
            hidden={{ storeId: product.storeId, productId: product.id, colour }}
            actionsClassName="px-(--card-spacing)"
          >
            <CardHeader>
              <CardTitle asChild className="text-sm font-semibold">
                <h3>{t("mockups")}</h3>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {t("mockupsBody")}
              </p>
            </CardHeader>
            {dirty ? (
              <CardContent>
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {t("saveFirst")}
                </p>
              </CardContent>
            ) : null}
          </ActionForm>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
