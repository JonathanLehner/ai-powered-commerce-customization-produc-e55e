"use client";

import { startTransition, useActionState, useMemo, useRef, useState } from "react";
import { attachArtwork, generateMockups, persistPlacement, removeArtwork } from "@/app/actions/products";
import { ActionForm, FormStatus, SubmitButton } from "@/components/forms";
import { Badge } from "@/components/ui";
import type { ActionState } from "@/app/actions/stores";
import { placementBox, validateArtwork, type ArtworkIssue } from "@/lib/artwork";
import { renderMockup, sameOriginAsset } from "@/lib/mockup-render";
import { appendStoredImage, uploadImage } from "@/lib/upload-client";
import type { Artwork, CatalogProduct, StoreProduct } from "@/lib/types";
import { classNames } from "@/lib/util";

interface Placement {
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

/**
 * Artwork goes up the moment a file is chosen — there is no second "upload"
 * click to forget. The file itself is posted to `/api/uploads`, which has no
 * 1 MB Server Action body cap; the action that records it then only carries the
 * returned metadata. The input locks while the upload is in flight so a second
 * pick cannot race the first.
 */
function UploadForm({
  storeId,
  productId,
  areaId,
  areaName,
  maxFileMb,
  needsTransparency,
}: {
  storeId: string;
  productId: string;
  areaId: string;
  areaName: string;
  maxFileMb: number;
  needsTransparency: boolean;
}) {
  const [state, formAction, saving] = useActionState<ActionState, FormData>(attachArtwork, {
    status: "idle",
  });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const busy = uploading || saving;
  const invalid = uploadError !== null || state.field === "artwork";

  async function onFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    // Clearing the input straight away means picking the same file again still
    // fires a change event, and a second pick cannot ride on the first.
    event.currentTarget.value = "";
    if (!file) return;

    setUploadError(null);
    if (file.size > maxFileMb * 1024 * 1024) {
      setUploadError(
        `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. This supplier accepts up to ${maxFileMb} MB.`,
      );
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
      setUploadError(error instanceof Error ? error.message : "That file could not be uploaded.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="card p-4">
      <label htmlFor="artwork" className="field-label">
        Artwork for {areaName}
      </label>
      <input
        id="artwork"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={busy}
        onChange={onFileChosen}
        aria-invalid={invalid ? true : undefined}
        aria-describedby="artwork-hint"
        className={classNames(
          "input file:mr-3 file:rounded-md file:border-0 file:bg-canvas file:px-3 file:py-1.5 file:text-sm",
          invalid && "input-error",
          busy && "opacity-60",
        )}
      />
      <p id="artwork-hint" className="field-hint">
        PNG, JPG or WEBP up to {maxFileMb} MB. Uploads as soon as you choose a file.
        {needsTransparency ? " This product needs a transparent background." : ""}
      </p>
      {busy ? (
        <p role="status" aria-live="polite" className="mt-4 text-sm text-muted">
          {uploading ? "Uploading…" : "Saving…"}
        </p>
      ) : uploadError ? (
        <p role="status" aria-live="polite" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {uploadError}
        </p>
      ) : (
        <FormStatus state={state} />
      )}
    </div>
  );
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

  const colour = product.variants.find((v) => v.enabled)?.colour ?? catalog.variants[0]?.colour ?? "";
  const base = useMemo(() => {
    if (!area) return null;
    return (
      catalog.mockups.find((m) => m.view === area.view && m.colour === colour) ??
      catalog.mockups.find((m) => m.view === area.view) ??
      null
    );
  }, [area, catalog.mockups, colour]);

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
        const blob = await renderMockup(photo.url, target.rect, [
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
        const stored = await uploadImage(
          new File([blob], `${target.id}.webp`, { type: blob.type || "image/webp" }),
          "mockup",
          { storeId: product.storeId, productId: product.id },
        );
        return { areaId: target.id, stored };
      }),
    );

    for (const result of rendered) {
      if (result.status !== "fulfilled") continue;
      appendStoredImage(formData, `mockup_${result.value.areaId}`, result.value.stored);
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
      <p className="text-sm text-muted">
        This supplier product has no print areas or product photography configured.
      </p>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div>
        <div role="tablist" aria-label="Print areas" className="flex flex-wrap gap-2">
          {catalog.printAreas.map((a) => {
            const hasArt = product.artworks.some((art) => art.printAreaId === a.id);
            return (
              <button
                key={a.id}
                type="button"
                role="tab"
                aria-selected={a.id === area.id}
                onClick={() => setActiveAreaId(a.id)}
                className={classNames(
                  "rounded-lg border px-3 py-1.5 text-sm font-medium transition",
                  a.id === area.id
                    ? "border-brand-500 bg-brand-50 text-brand-800"
                    : "border-line bg-white text-inksoft hover:bg-canvas",
                )}
              >
                {a.name}
                {hasArt ? <span className="ml-1.5 text-xs text-emerald-600">●</span> : null}
              </button>
            );
          })}
        </div>

        <div
          ref={canvasRef}
          className="relative mt-4 overflow-hidden rounded-xl border border-line bg-canvas"
          style={{ aspectRatio: "1 / 1" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={sameOriginAsset(base.url)}
            alt={`${catalog.name} — ${area.name} view in ${base.colour}`}
            className="h-full w-full select-none object-cover"
            draggable={false}
          />
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
                aria-label={`${liveArtwork.fileName} placement. Use arrow keys to move, plus and minus to resize.`}
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

        <p className="mt-2 text-xs text-muted">
          Printable area {area.widthMm} × {area.heightMm} mm at {area.minDpi} DPI minimum. Drag the artwork, or
          focus it and use the arrow keys.
        </p>
      </div>

      <div className="space-y-5">
        {artwork && placement ? (
          <>
            <div className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{artwork.fileName}</p>
                  <p className="text-xs text-muted">
                    {artwork.pixelWidth} × {artwork.pixelHeight} px ·{" "}
                    {(artwork.sizeBytes / 1024).toFixed(0)} KB · {artwork.hasAlpha ? "transparent" : "opaque"}
                  </p>
                </div>
                {!readOnly ? (
                  <form action={removeArtwork}>
                    <input type="hidden" name="storeId" value={product.storeId} />
                    <input type="hidden" name="productId" value={product.id} />
                    <input type="hidden" name="artworkId" value={artwork.id} />
                    <button type="submit" className="btn-ghost btn-sm text-rose-700">
                      Remove
                    </button>
                  </form>
                ) : null}
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <label htmlFor="scale" className="flex items-center justify-between text-xs font-medium text-ink">
                    <span>Size</span>
                    <span className="tabular-nums text-muted">
                      {box ? `${Math.round(box.printedWidthMm)} × ${Math.round(box.printedHeightMm)} mm` : ""}
                    </span>
                  </label>
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
                  <label htmlFor="rotation" className="flex items-center justify-between text-xs font-medium text-ink">
                    <span>Rotation</span>
                    <span className="tabular-nums text-muted">{placement.rotation}°</span>
                  </label>
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
                  <div>
                    <label htmlFor="pos-x" className="text-xs font-medium text-ink">
                      Horizontal %
                    </label>
                    <input
                      id="pos-x"
                      type="number"
                      min={-50}
                      max={150}
                      step={1}
                      disabled={readOnly}
                      value={Math.round(placement.x * 100)}
                      onChange={(e) => update(artwork.id, { x: Number(e.currentTarget.value) / 100 })}
                      className="input py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="pos-y" className="text-xs font-medium text-ink">
                      Vertical %
                    </label>
                    <input
                      id="pos-y"
                      type="number"
                      min={-50}
                      max={150}
                      step={1}
                      disabled={readOnly}
                      value={Math.round(placement.y * 100)}
                      onChange={(e) => update(artwork.id, { y: Number(e.currentTarget.value) / 100 })}
                      className="input py-1.5 text-sm"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-canvas px-3 py-2 text-xs">
                  <span className="text-muted">Effective print resolution</span>
                  <span
                    className={classNames(
                      "font-semibold tabular-nums",
                      box && box.effectiveDpi >= Math.max(area.minDpi, catalog.fileRequirements.minDpi)
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
                  <SubmitButton className="btn-primary w-full" pendingLabel="Saving placement…">
                    {dirty ? "Save placement" : "Placement saved"}
                  </SubmitButton>
                </form>
              ) : null}
            </div>

            <div className="card p-4">
              <h3 className="text-sm font-semibold text-ink">Supplier pre-flight</h3>
              {errors.length === 0 && warnings.length === 0 ? (
                <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  ✓ This placement passes every check for {catalog.name}.
                </p>
              ) : null}
              {errors.length > 0 ? (
                <div className="mt-2" role="alert">
                  <Badge tone="rose">
                    {errors.length} blocking issue{errors.length === 1 ? "" : "s"}
                  </Badge>
                  <ul className="mt-2 space-y-2.5">
                    {errors.map((issue) => (
                      <li key={issue.code} className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                        <p className="text-sm font-medium text-rose-900">{issue.message}</p>
                        <p className="mt-1 text-xs text-rose-800">How to fix: {issue.fix}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {warnings.length > 0 ? (
                <ul className="mt-2 space-y-2.5">
                  {warnings.map((issue) => (
                    <li key={issue.code} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <p className="text-sm font-medium text-amber-900">{issue.message}</p>
                      <p className="mt-1 text-xs text-amber-800">{issue.fix}</p>
                    </li>
                  ))}
                </ul>
              ) : null}
              <dl className="mt-3 space-y-1.5 text-xs text-muted">
                <div className="flex justify-between gap-2">
                  <dt>Accepted formats</dt>
                  <dd className="text-ink">{catalog.fileRequirements.formats.join(", ")}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Maximum file size</dt>
                  <dd className="text-ink">{catalog.fileRequirements.maxFileMb} MB</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Transparent background</dt>
                  <dd className="text-ink">
                    {catalog.fileRequirements.transparentBackgroundRequired ? "Required" : "Optional"}
                  </dd>
                </div>
              </dl>
            </div>
          </>
        ) : (
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-ink">No artwork on {area.name}</h3>
            <p className="mt-1.5 text-sm text-muted">
              Upload the client&rsquo;s logo or a design for this print area. It is placed in the centre and you
              can move it from there.
            </p>
          </div>
        )}

        {!readOnly ? (
          <UploadForm
            key={area.id}
            storeId={product.storeId}
            productId={product.id}
            areaId={area.id}
            areaName={area.name}
            maxFileMb={catalog.fileRequirements.maxFileMb}
            needsTransparency={catalog.fileRequirements.transparentBackgroundRequired}
          />
        ) : null}

        {!readOnly ? (
          <ActionForm
            action={generateMockups}
            beforeSubmit={renderMockups}
            submitLabel="Generate mockups"
            pendingLabel="Rendering previews…"
            submitClassName="btn-iris w-full"
            hidden={{ storeId: product.storeId, productId: product.id }}
            className="card p-4"
          >
            <h3 className="text-sm font-semibold text-ink">Mockups</h3>
            <p className="mt-1.5 text-sm text-muted">
              Renders the saved placement onto the supplier photography for every decorated view. Approving the
              result is required before publishing.
            </p>
            {dirty ? (
              <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                You have unsaved placement changes — save them first so the preview matches.
              </p>
            ) : null}
          </ActionForm>
        ) : null}
      </div>
    </div>
  );
}
