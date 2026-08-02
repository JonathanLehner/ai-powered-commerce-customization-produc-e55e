"use client";

import type { Rect } from "./types";

export interface MockupLayer {
  artworkUrl?: string | null;
  /** Intrinsic artwork size, used so the aspect ratio survives scaling. */
  pixelWidth?: number;
  pixelHeight?: number;
  /** Centre position and size as fractions of the print area box. */
  x: number;
  y: number;
  scale: number;
  rotation: number;
  text?: string | null;
  textColour?: string;
}

/** Longest edge of a rendered preview. Supplier photography is square at 1024px. */
const MAX_EDGE = 1024;

/**
 * Supplier photography and uploaded artwork live on the asset host, which sends
 * no CORS headers, so drawing them straight into a canvas would taint it and
 * `toBlob` would throw. Routing them through the app's own proxy keeps every
 * source same-origin.
 */
export function sameOriginAsset(url: string): string {
  if (url.startsWith("blob:") || url.startsWith("data:") || url.startsWith("/")) return url;
  return `/api/asset?u=${encodeURIComponent(url)}`;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ${url}`));
    image.src = sameOriginAsset(url);
  });
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("The preview could not be encoded."))),
      "image/webp",
      0.82,
    );
  });
}

/**
 * Composites artwork and personalisation text onto supplier photography inside
 * the declared print area, matching the placement shown in the configurator.
 */
export async function renderMockup(
  baseUrl: string,
  rect: Rect,
  layers: MockupLayer[],
): Promise<Blob> {
  const base = await loadImage(baseUrl);
  const naturalW = base.naturalWidth || MAX_EDGE;
  const naturalH = base.naturalHeight || MAX_EDGE;
  const ratio = Math.min(1, MAX_EDGE / Math.max(naturalW, naturalH));
  const width = Math.max(1, Math.round(naturalW * ratio));
  const height = Math.max(1, Math.round(naturalH * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot render previews.");

  ctx.drawImage(base, 0, 0, width, height);

  const areaX = rect.x * width;
  const areaY = rect.y * height;
  const areaW = rect.w * width;
  const areaH = rect.h * height;

  for (const layer of layers) {
    const centreX = areaX + layer.x * areaW;
    const centreY = areaY + layer.y * areaH;

    if (layer.artworkUrl) {
      const art = await loadImage(layer.artworkUrl);
      const intrinsicW = layer.pixelWidth || art.naturalWidth || 1;
      const intrinsicH = layer.pixelHeight || art.naturalHeight || 1;
      const drawW = Math.max(8, layer.scale * areaW);
      const drawH = Math.max(8, drawW * (intrinsicH / intrinsicW));
      ctx.save();
      ctx.translate(centreX, centreY);
      if (layer.rotation) ctx.rotate((layer.rotation * Math.PI) / 180);
      ctx.drawImage(art, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();
      continue;
    }

    if (layer.text) {
      const fontSize = Math.max(12, layer.scale * areaW * 0.22);
      ctx.save();
      ctx.translate(centreX, centreY);
      if (layer.rotation) ctx.rotate((layer.rotation * Math.PI) / 180);
      ctx.font = `700 ${fontSize}px ui-sans-serif, system-ui, Helvetica, Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = layer.textColour ?? "#111827";
      ctx.fillText(layer.text, 0, 0);
      ctx.restore();
    }
  }

  return toBlob(canvas);
}

/** Renders a preview and attaches it to a form submission under `field`. */
export async function attachMockup(
  formData: FormData,
  field: string,
  baseUrl: string,
  rect: Rect,
  layers: MockupLayer[],
): Promise<void> {
  const blob = await renderMockup(baseUrl, rect, layers);
  formData.set(field, new File([blob], `${field}.webp`, { type: "image/webp" }));
}
