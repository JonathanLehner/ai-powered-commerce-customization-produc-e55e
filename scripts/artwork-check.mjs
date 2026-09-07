// Self-check for the shopper artwork pre-flight: npm run artwork-check
//
// The storefront used to check nothing but the file size, so a 200 × 200 px
// logo previewed happily and went through to a production job. These are the
// checks that stop that, run through the very functions the product page and
// addToCart call.
import assert from "node:assert/strict";
import {
  canPreview,
  fileTooLargeIssue,
  issueSentence,
  shopperAccept,
  shopperArtworkIssues,
  shopperBlockingIssues,
  shopperFormats,
  unreadableFormatIssue,
} from "../src/lib/artwork-shopper.ts";
import { placementBox } from "../src/lib/artwork.ts";
import { copyFor, LANGUAGES } from "../src/lib/i18n.ts";
import { DEFAULT_PLACEMENT } from "../src/lib/types.ts";

const t = copyFor("en").artwork;

// The mug from the seed catalog: 200 × 85 mm at 300 DPI, PNG/JPG/PDF, 15 MB.
const AREA = {
  id: "pa_mug_wrap",
  name: "Wrap",
  view: "front",
  widthMm: 200,
  heightMm: 85,
  minDpi: 300,
  rect: { x: 0.28, y: 0.3, w: 0.44, h: 0.34 },
};
const RULES = {
  formats: ["PNG", "JPG", "PDF"],
  maxFileMb: 15,
  minDpi: 300,
  transparentBackgroundRequired: false,
  maxPixels: 25_000_000,
};
const APPAREL_RULES = { ...RULES, formats: ["PNG", "SVG", "PDF"], transparentBackgroundRequired: true };

const artwork = (over = {}) => ({
  id: "art_1",
  printAreaId: AREA.id,
  view: "front",
  fileName: "logo.png",
  url: "https://assets.clawcorp.ai/logo.png",
  mimeType: "image/png",
  sizeBytes: 400 * 1024,
  pixelWidth: 4000,
  pixelHeight: 1700,
  hasAlpha: true,
  ...DEFAULT_PLACEMENT,
  ...over,
});

const codes = (issues) => issues.map((i) => i.code).sort();

/* ------------------------------------- the 200 × 200 logo the client reported */

const tiny = artwork({ pixelWidth: 200, pixelHeight: 200 });
const tinyErrors = shopperBlockingIssues(shopperArtworkIssues(tiny, AREA, RULES, t));
assert.ok(
  tinyErrors.some((i) => i.code === "low_dpi"),
  "a 200 px logo across a 200 mm wrap must be refused, not previewed",
);

// The message says what it will print at, and the fix says how many pixels are
// needed — the numbers, not just "too low".
const lowDpi = tinyErrors.find((i) => i.code === "low_dpi");
const box = placementBox(tiny, AREA);
assert.match(lowDpi.message, new RegExp(`\\b${Math.round(box.effectiveDpi)} DPI\\b`));
assert.match(lowDpi.message, /\b300 DPI\b/);
assert.match(lowDpi.fix, new RegExp(`\\b${Math.ceil((300 * box.printedWidthMm) / 25.4)} pixels\\b`));
assert.ok(issueSentence(lowDpi).startsWith(lowDpi.message));
assert.ok(issueSentence(lowDpi).endsWith(lowDpi.fix), "a one-line refusal still carries the fix");

// Scaled down far enough, the very same file passes: the reading follows the
// placement rather than the upload.
const shrunk = { ...tiny, scale: 0.08 };
assert.deepEqual(
  codes(shopperBlockingIssues(shopperArtworkIssues(shrunk, AREA, RULES, t))),
  [],
  "the same file placed small enough is printable",
);

/* ------------------------------------------------------ format, size, alpha */

const jpeg = artwork({ mimeType: "image/jpeg", fileName: "logo.jpg", hasAlpha: false });
assert.deepEqual(codes(shopperBlockingIssues(shopperArtworkIssues(jpeg, AREA, RULES, t))), []);
assert.deepEqual(
  codes(shopperBlockingIssues(shopperArtworkIssues(jpeg, AREA, APPAREL_RULES, t))),
  ["bad_format", "no_transparency"],
  "apparel takes neither a JPG nor an opaque background",
);

const huge = artwork({ sizeBytes: 22 * 1024 * 1024 });
const tooBig = shopperBlockingIssues(shopperArtworkIssues(huge, AREA, RULES, t));
assert.deepEqual(codes(tooBig), ["file_too_large"]);
assert.match(tooBig[0].message, /22\.0 MB/);
assert.match(tooBig[0].message, /15 MB/);

const megapixels = artwork({ pixelWidth: 8000, pixelHeight: 6000 });
assert.ok(
  codes(shopperBlockingIssues(shopperArtworkIssues(megapixels, AREA, RULES, t))).includes(
    "too_many_pixels",
  ),
);

/* ------------------------------------------------- placement inside the area */

const dragged = artwork({ x: 1.4 });
assert.ok(
  codes(shopperBlockingIssues(shopperArtworkIssues(dragged, AREA, RULES, t))).includes(
    "outside_print_area",
  ),
  "artwork dragged off the print area is refused",
);

// Rotation is part of the geometry, so a wide design turned on its side
// overflows the short edge of the wrap.
const turned = artwork({ rotation: 90, scale: 0.9 });
assert.ok(
  codes(shopperBlockingIssues(shopperArtworkIssues(turned, AREA, RULES, t))).includes(
    "outside_print_area",
  ),
);

/* --------------------------------------------- advisories do not block a sale */

const marginal = artwork({ pixelWidth: 1300, pixelHeight: 553, scale: 0.5 });
const marginalIssues = shopperArtworkIssues(marginal, AREA, RULES, t);
assert.ok(marginalIssues.some((i) => i.severity === "warning"));
assert.deepEqual(shopperBlockingIssues(marginalIssues), [], "a warning is advice, not a refusal");

/* ------------------------------------- files the storefront cannot even read */

assert.equal(canPreview("image/png"), true);
assert.equal(canPreview("image/jpeg; charset=binary"), true);
assert.equal(canPreview("application/pdf"), false);

// The supplier's PDF is not offered to a shopper, because nothing in a browser
// can measure it or show them where it lands.
assert.deepEqual(shopperFormats(RULES), ["PNG", "JPG"]);
assert.deepEqual(shopperFormats(APPAREL_RULES), ["PNG"]);
assert.equal(shopperAccept(APPAREL_RULES), "image/png");
assert.equal(shopperAccept(RULES), "image/png,image/jpeg");

const pdf = unreadableFormatIssue("application/pdf", RULES, t);
assert.equal(pdf.severity, "error");
assert.match(pdf.message, /PDF/);
assert.match(pdf.fix, /PNG, JPG/);

const early = fileTooLargeIssue(18 * 1024 * 1024, RULES, t);
assert.equal(early.code, "file_too_large");
assert.match(early.message, /18\.0 MB/);

/* ------------------------------------------ every storefront language answers */

for (const { code } of LANGUAGES) {
  const dictionary = copyFor(code).artwork;
  const issues = shopperArtworkIssues(tiny, AREA, RULES, dictionary);
  for (const issue of issues) {
    assert.ok(issue.message.trim().length > 0, `${code} has no message for ${issue.code}`);
    assert.ok(issue.fix.trim().length > 0, `${code} has no fix for ${issue.code}`);
    assert.ok(!/\{\w+\}/.test(issueSentence(issue)), `${code}.${issue.code} left a placeholder unfilled`);
  }
}

console.log("artwork-check ok");
