import "server-only";
import sharp, { type OverlayOptions } from "sharp";
import { uploadFile } from "./platform";
import type { PrintArea } from "./types";

export interface MockupLayer {
  artworkUrl?: string | null;
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

const fetchCache = new Map<string, Buffer>();

async function fetchImage(url: string): Promise<Buffer> {
  const cached = fetchCache.get(url);
  if (cached) return cached;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Could not load image ${url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (fetchCache.size > 40) fetchCache.clear();
  fetchCache.set(url, buf);
  return buf;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Composites artwork (and optional personalisation text) onto a supplier base
 * photograph inside the declared print area, returning WebP bytes.
 */
export async function renderMockup(
  baseUrl: string,
  area: PrintArea,
  layers: MockupLayer[],
): Promise<Buffer> {
  const baseBuf = await fetchImage(baseUrl);
  const base = sharp(baseBuf).rotate();
  const meta = await base.metadata();
  const W = meta.width ?? 1024;
  const H = meta.height ?? 1024;

  const areaX = area.rect.x * W;
  const areaY = area.rect.y * H;
  const areaW = area.rect.w * W;
  const areaH = area.rect.h * H;

  const composites: OverlayOptions[] = [];

  for (const layer of layers) {
    let overlay: Buffer | null = null;
    let overlayW = 0;
    let overlayH = 0;

    if (layer.artworkUrl) {
      const artBuf = await fetchImage(layer.artworkUrl);
      const aspect =
        layer.pixelHeight && layer.pixelWidth ? layer.pixelHeight / layer.pixelWidth : 1;
      const targetW = Math.max(8, Math.round(layer.scale * areaW));
      const targetH = Math.max(8, Math.round(targetW * aspect));
      let pipeline = sharp(artBuf).resize(targetW, targetH, { fit: "fill" }).png();
      if (layer.rotation) {
        pipeline = pipeline.rotate(layer.rotation, {
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        });
      }
      const out = await pipeline.toBuffer({ resolveWithObject: true });
      overlay = out.data;
      overlayW = out.info.width;
      overlayH = out.info.height;
    } else if (layer.text) {
      const fontSize = Math.max(12, Math.round(layer.scale * areaW * 0.22));
      const boxW = Math.max(32, Math.round(areaW * Math.min(1, layer.scale)));
      const boxH = Math.round(fontSize * 1.6);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${boxW}" height="${boxH}">
        <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
          font-family="DejaVu Sans, Helvetica, Arial, sans-serif" font-size="${fontSize}"
          font-weight="700" fill="${layer.textColour ?? "#111827"}">${escapeXml(layer.text)}</text>
      </svg>`;
      let pipeline = sharp(Buffer.from(svg)).png();
      if (layer.rotation) {
        pipeline = pipeline.rotate(layer.rotation, {
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        });
      }
      const out = await pipeline.toBuffer({ resolveWithObject: true });
      overlay = out.data;
      overlayW = out.info.width;
      overlayH = out.info.height;
    }

    if (!overlay) continue;

    const centreX = areaX + layer.x * areaW;
    const centreY = areaY + layer.y * areaH;
    let left = Math.round(centreX - overlayW / 2);
    let top = Math.round(centreY - overlayH / 2);

    // Clip overlays that hang off the canvas so sharp never receives an
    // out-of-bounds composite (over-hanging artwork is still previewable).
    let cropLeft = 0;
    let cropTop = 0;
    let cropW = overlayW;
    let cropH = overlayH;
    if (left < 0) {
      cropLeft = -left;
      cropW -= cropLeft;
      left = 0;
    }
    if (top < 0) {
      cropTop = -top;
      cropH -= cropTop;
      top = 0;
    }
    if (left + cropW > W) cropW = W - left;
    if (top + cropH > H) cropH = H - top;
    if (cropW <= 0 || cropH <= 0) continue;

    const finalBuf =
      cropLeft === 0 && cropTop === 0 && cropW === overlayW && cropH === overlayH
        ? overlay
        : await sharp(overlay)
            .extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH })
            .png()
            .toBuffer();

    composites.push({ input: finalBuf, left, top });
  }

  return sharp(baseBuf)
    .rotate()
    .composite(composites)
    .webp({ quality: 82 })
    .toBuffer();
}

export async function renderAndUploadMockup(
  baseUrl: string,
  area: PrintArea,
  layers: MockupLayer[],
): Promise<string> {
  const buf = await renderMockup(baseUrl, area, layers);
  return uploadFile(buf, "image/webp");
}

/** Reads dimensions and alpha channel presence from uploaded artwork bytes. */
export async function inspectImage(bytes: Buffer): Promise<{
  width: number;
  height: number;
  hasAlpha: boolean;
}> {
  const meta = await sharp(bytes).metadata();
  return {
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    hasAlpha: Boolean(meta.hasAlpha),
  };
}
