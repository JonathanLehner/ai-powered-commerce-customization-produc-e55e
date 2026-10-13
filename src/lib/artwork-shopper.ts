import {
  acceptedFormats,
  acceptedMimeTypes,
  formatOf,
  isAcceptedFormat,
  placementBox,
  requiredDpi,
  validateArtwork,
  type ArtworkIssue,
} from "./artwork";
import type { ShopperTranslator } from "@/i18n/shopper-copy";
import type { Artwork, FileRequirements, PrintArea } from "./types";

/**
 * The shopper's half of the supplier pre-flight.
 *
 * `validateArtwork` is the single source of truth for what a supplier will and
 * will not print, but it speaks to a store manager, in English. The storefront
 * runs exactly the same checks and turns each issue into the store's own
 * language, keyed off the issue code so the wording stays ours — and always
 * with the correction attached, because a shopper who is refused needs to know
 * which file to go and fetch.
 *
 * Both the product page (as soon as a file is chosen, and again on every drag)
 * and `addToCart` (which cannot trust the browser) read their wording here.
 */

const MM_PER_INCH = 25.4;

export interface ShopperArtworkIssue {
  code: string;
  severity: ArtworkIssue["severity"];
  /** What is wrong, in the storefront's language. */
  message: string;
  /** What the shopper should do about it. */
  fix: string;
}

/** Formats the browser can measure, place and composite into a preview. */
const PREVIEWABLE_MIME: Record<string, string> = {
  "image/png": "PNG",
  "image/jpeg": "JPG",
  "image/webp": "WEBP",
};

export function canPreview(mimeType: string): boolean {
  return mimeType.split(";")[0].trim().toLowerCase() in PREVIEWABLE_MIME;
}

/**
 * What the shopper may upload: the same list the workspace upload field and its
 * pre-flight name, so the storefront never promises a format the supplier
 * refuses.
 */
export function shopperFormats(rules: FileRequirements): string[] {
  return acceptedFormats(rules);
}

/** The `accept` attribute for a file input restricted to those formats. */
export function shopperAccept(rules: FileRequirements): string {
  return acceptedMimeTypes(rules);
}

function translate(
  issue: ArtworkIssue,
  artwork: Artwork,
  area: PrintArea,
  rules: FileRequirements,
  t: ShopperTranslator<"artwork">,
): ShopperArtworkIssue {
  const box = placementBox(artwork, area);
  const required = requiredDpi(area, rules);
  const base = { code: issue.code, severity: issue.severity };

  switch (issue.code) {
    case "outside_print_area":
      return {
        ...base,
        message: t("outsideArea"),
        fix: t("outsideAreaFix", { width: area.widthMm, height: area.heightMm }),
      };
    case "low_dpi":
      return {
        ...base,
        message: t("lowDpi", { dpi: Math.round(box.effectiveDpi), required }),
        fix: t("lowDpiFix", {
          pixels: Math.ceil((required * box.printedWidthMm) / MM_PER_INCH),
          width: Math.max(1, Math.floor((artwork.pixelWidth / required) * MM_PER_INCH)),
        }),
      };
    case "bad_format":
      return {
        ...base,
        message: t("badFormat", { format: formatOf(artwork.mimeType) }),
        fix: t("badFormatFix", { formats: shopperFormats(rules).join(", ") }),
      };
    case "file_too_large":
      return {
        ...base,
        message: t("fileTooLarge", {
          size: (artwork.sizeBytes / (1024 * 1024)).toFixed(1),
          limit: rules.maxFileMb,
        }),
        fix: t("fileTooLargeFix"),
      };
    case "too_many_pixels":
      return {
        ...base,
        message: t("tooManyPixels", {
          megapixels: (rules.maxPixels / 1_000_000).toFixed(0),
        }),
        fix: t("tooManyPixelsFix"),
      };
    case "no_transparency":
      return { ...base, message: t("noTransparency"), fix: t("noTransparencyFix") };
    case "dpi_close_to_limit":
      return {
        ...base,
        message: t("dpiTight", { dpi: Math.round(box.effectiveDpi), required }),
        fix: t("dpiTightFix"),
      };
    case "very_small":
      return { ...base, message: t("verySmall"), fix: t("verySmallFix") };
    default:
      return { ...base, message: t("generic"), fix: t("genericFix") };
  }
}

/** Every supplier check, in the storefront's language, placement included. */
export function shopperArtworkIssues(
  artwork: Artwork,
  area: PrintArea,
  rules: FileRequirements,
  t: ShopperTranslator<"artwork">,
): ShopperArtworkIssue[] {
  return validateArtwork(artwork, area, rules).map((issue) =>
    translate(issue, artwork, area, rules, t),
  );
}

export function shopperBlockingIssues(issues: ShopperArtworkIssue[]): ShopperArtworkIssue[] {
  return issues.filter((i) => i.severity === "error");
}

/**
 * The refusal for a file in a format this print area does not take, before it
 * is uploaded: named as not accepted when it is an image the supplier refuses,
 * as unreadable when nothing here could measure it.
 */
export function formatNotAcceptedIssue(
  mimeType: string,
  rules: FileRequirements,
  t: ShopperTranslator<"artwork">,
): ShopperArtworkIssue | null {
  if (isAcceptedFormat(mimeType, rules)) return null;
  if (!canPreview(mimeType)) return unreadableFormatIssue(mimeType, rules, t);
  return {
    code: "bad_format",
    severity: "error",
    message: t("badFormat", { format: formatOf(mimeType) }),
    fix: t("badFormatFix", { formats: shopperFormats(rules).join(", ") }),
  };
}

/**
 * A file the supplier would accept but the storefront cannot measure — a PDF or
 * an SVG. It never reaches `validateArtwork`, because there is nothing to
 * validate, so its refusal is written here.
 */
export function unreadableFormatIssue(
  mimeType: string,
  rules: FileRequirements,
  t: ShopperTranslator<"artwork">,
): ShopperArtworkIssue {
  return {
    code: "unreadable_format",
    severity: "error",
    message: t("unreadableFormat", { format: formatOf(mimeType) }),
    fix: t("unreadableFormatFix", { formats: shopperFormats(rules).join(", ") }),
  };
}

/** The size check that runs before the bytes are sent anywhere. */
export function fileTooLargeIssue(
  sizeBytes: number,
  rules: FileRequirements,
  t: ShopperTranslator<"artwork">,
): ShopperArtworkIssue {
  return {
    code: "file_too_large",
    severity: "error",
    message: t("fileTooLarge", {
      size: (sizeBytes / (1024 * 1024)).toFixed(1),
      limit: rules.maxFileMb,
    }),
    fix: t("fileTooLargeFix"),
  };
}

/** One sentence for callers with a single line to spend, such as a form error. */
export function issueSentence(issue: ShopperArtworkIssue): string {
  return `${issue.message} ${issue.fix}`;
}
