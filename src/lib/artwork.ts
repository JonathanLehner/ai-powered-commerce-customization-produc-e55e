import type { Artwork, FileRequirements, PrintArea, StoreProduct } from "./types";

/**
 * A product can only be sold while its previews show what will actually be
 * printed. Uploading, moving or removing artwork clears the mockups, and
 * regenerating them resets every preview to unapproved, so either state means
 * the product must come off the storefront.
 */
export function hasApprovedPreviews(product: Pick<StoreProduct, "artworks" | "mockups">) {
  return (
    product.artworks.length > 0 &&
    product.mockups.length > 0 &&
    product.mockups.every((m) => m.approved)
  );
}

export function isLive(product: StoreProduct) {
  return product.status === "published" && hasApprovedPreviews(product);
}


export interface PlacementBox {
  /** All values are fractions of the print area box. */
  x: number;
  y: number;
  w: number;
  h: number;
  rotatedW: number;
  rotatedH: number;
  printedWidthMm: number;
  printedHeightMm: number;
  effectiveDpi: number;
}

const MM_PER_INCH = 25.4;

/**
 * Turns an artwork placement into printable geometry.
 * `scale` is the artwork width as a fraction of the print area width, `x`/`y`
 * are the artwork centre expressed as fractions of the print area box.
 */
export function placementBox(artwork: Artwork, area: PrintArea): PlacementBox {
  const aspect = artwork.pixelHeight / Math.max(artwork.pixelWidth, 1);
  const w = artwork.scale;
  const printedWidthMm = w * area.widthMm;
  const printedHeightMm = printedWidthMm * aspect;
  const h = printedHeightMm / area.heightMm;

  const rad = (artwork.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  // Rotation happens in physical space, so convert to mm, rotate, convert back.
  const rotatedMmW = printedWidthMm * cos + printedHeightMm * sin;
  const rotatedMmH = printedWidthMm * sin + printedHeightMm * cos;

  const effectiveDpi = printedWidthMm > 0 ? artwork.pixelWidth / (printedWidthMm / MM_PER_INCH) : 0;

  return {
    x: artwork.x,
    y: artwork.y,
    w,
    h,
    rotatedW: rotatedMmW / area.widthMm,
    rotatedH: rotatedMmH / area.heightMm,
    printedWidthMm,
    printedHeightMm,
    effectiveDpi,
  };
}

export type IssueSeverity = "error" | "warning";

export interface ArtworkIssue {
  code: string;
  severity: IssueSeverity;
  message: string;
  fix: string;
}

const MIME_TO_FORMAT: Record<string, string> = {
  "image/png": "PNG",
  "image/jpeg": "JPG",
  "image/webp": "WEBP",
  "image/svg+xml": "SVG",
  "application/pdf": "PDF",
};

export function formatOf(mimeType: string): string {
  return MIME_TO_FORMAT[mimeType] ?? mimeType.split("/").pop()?.toUpperCase() ?? "UNKNOWN";
}

/**
 * Supplier pre-flight. Every returned `error` blocks approval and publishing;
 * warnings are advisory. Each issue carries the correction the user must make.
 */
export function validateArtwork(
  artwork: Artwork,
  area: PrintArea,
  requirements: FileRequirements,
): ArtworkIssue[] {
  const issues: ArtworkIssue[] = [];
  const box = placementBox(artwork, area);
  const tolerance = 0.002;

  const left = box.x - box.rotatedW / 2;
  const right = box.x + box.rotatedW / 2;
  const top = box.y - box.rotatedH / 2;
  const bottom = box.y + box.rotatedH / 2;

  const overflows: string[] = [];
  if (left < -tolerance) overflows.push("left");
  if (right > 1 + tolerance) overflows.push("right");
  if (top < -tolerance) overflows.push("top");
  if (bottom > 1 + tolerance) overflows.push("bottom");

  if (overflows.length > 0) {
    const worst = Math.max(-left, right - 1, -top, bottom - 1);
    const overshootMm = Math.round(worst * Math.max(area.widthMm, area.heightMm));
    issues.push({
      code: "outside_print_area",
      severity: "error",
      message: `Artwork extends past the ${overflows.join(" and ")} edge of the ${area.name} print area by about ${overshootMm} mm.`,
      fix: `Drag the artwork back inside the dashed print area, or reduce the size until the whole design sits within ${area.widthMm} × ${area.heightMm} mm.`,
    });
  }

  const requiredDpi = Math.max(area.minDpi, requirements.minDpi);
  if (box.effectiveDpi > 0 && box.effectiveDpi < requiredDpi) {
    const maxWidthMm = (artwork.pixelWidth / requiredDpi) * MM_PER_INCH;
    issues.push({
      code: "low_dpi",
      severity: "error",
      message: `Print resolution is ${Math.round(box.effectiveDpi)} DPI at this size. ${area.name} requires at least ${requiredDpi} DPI.`,
      fix: `Scale the artwork down to ${Math.floor(maxWidthMm)} mm wide or less, or upload a file at least ${Math.ceil((requiredDpi * box.printedWidthMm) / MM_PER_INCH)} px wide.`,
    });
  }

  const format = formatOf(artwork.mimeType);
  if (!requirements.formats.includes(format)) {
    issues.push({
      code: "bad_format",
      severity: "error",
      message: `${format} files are not accepted by this supplier.`,
      fix: `Re-export the artwork as ${requirements.formats.join(", ")} and upload it again.`,
    });
  }

  const maxBytes = requirements.maxFileMb * 1024 * 1024;
  if (artwork.sizeBytes > maxBytes) {
    issues.push({
      code: "file_too_large",
      severity: "error",
      message: `The file is ${(artwork.sizeBytes / (1024 * 1024)).toFixed(1)} MB. The supplier limit is ${requirements.maxFileMb} MB.`,
      fix: "Flatten unused layers or export at a lower compression quality, then upload again.",
    });
  }

  if (artwork.pixelWidth * artwork.pixelHeight > requirements.maxPixels) {
    issues.push({
      code: "too_many_pixels",
      severity: "error",
      message: `The image is ${artwork.pixelWidth} × ${artwork.pixelHeight} px, above the supplier's ${(requirements.maxPixels / 1_000_000).toFixed(0)} megapixel ceiling.`,
      fix: "Resize the artwork in your design tool so the total pixel count is under the supplier limit.",
    });
  }

  if (requirements.transparentBackgroundRequired && !artwork.hasAlpha) {
    issues.push({
      code: "no_transparency",
      severity: "error",
      message: "This product prints directly onto fabric and needs artwork with a transparent background.",
      fix: "Remove the background and export as PNG with an alpha channel.",
    });
  }

  if (box.effectiveDpi >= requiredDpi && box.effectiveDpi < requiredDpi * 1.25) {
    issues.push({
      code: "dpi_close_to_limit",
      severity: "warning",
      message: `Print resolution is ${Math.round(box.effectiveDpi)} DPI — only just above the ${requiredDpi} DPI minimum.`,
      fix: "Fine detail and thin lines may soften. A larger source file gives a cleaner print.",
    });
  }

  if (box.w < 0.15) {
    issues.push({
      code: "very_small",
      severity: "warning",
      message: "The design covers less than 15% of the print area width.",
      fix: "Scale up if the logo is meant to be a primary graphic rather than a small badge.",
    });
  }

  return issues;
}

export function blockingIssues(issues: ArtworkIssue[]): ArtworkIssue[] {
  return issues.filter((i) => i.severity === "error");
}
