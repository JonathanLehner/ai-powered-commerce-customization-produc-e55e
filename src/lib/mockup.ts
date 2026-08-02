import "server-only";

/**
 * Image metadata read straight from the file header.
 *
 * The deployment target has no native image toolchain, so dimensions and the
 * alpha channel are parsed from the container instead of decoding the pixels.
 * Compositing happens in the browser (see `lib/mockup-render.ts`) and the
 * finished preview is uploaded from there.
 */
export interface ImageMeta {
  width: number;
  height: number;
  hasAlpha: boolean;
}

const EMPTY: ImageMeta = { width: 0, height: 0, hasAlpha: false };

function u32(b: Uint8Array, at: number): number {
  return ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
}

function fourcc(b: Uint8Array, at: number): string {
  return String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);
}

function png(b: Uint8Array): ImageMeta {
  if (b.length < 26 || fourcc(b, 12) !== "IHDR") return EMPTY;
  const colourType = b[25];
  let hasAlpha = colourType === 4 || colourType === 6;

  // Palette and greyscale images carry transparency in a tRNS chunk instead.
  if (!hasAlpha) {
    let at = 8;
    while (at + 8 <= b.length) {
      const length = u32(b, at);
      const type = fourcc(b, at + 4);
      if (type === "tRNS") {
        hasAlpha = true;
        break;
      }
      if (type === "IDAT" || type === "IEND") break;
      at += 12 + length;
    }
  }
  return { width: u32(b, 16), height: u32(b, 20), hasAlpha };
}

function jpeg(b: Uint8Array): ImageMeta {
  let at = 2;
  while (at + 9 < b.length) {
    if (b[at] !== 0xff) {
      at += 1;
      continue;
    }
    const marker = b[at + 1];
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break;
    const length = (b[at + 2] << 8) | b[at + 3];
    // Any start-of-frame marker except the huffman and arithmetic table ones.
    const isFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      return {
        height: (b[at + 5] << 8) | b[at + 6],
        width: (b[at + 7] << 8) | b[at + 8],
        hasAlpha: false,
      };
    }
    at += 2 + length;
  }
  return EMPTY;
}

function webp(b: Uint8Array): ImageMeta {
  if (b.length < 30) return EMPTY;
  const chunk = fourcc(b, 12);
  if (chunk === "VP8X") {
    return {
      width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)),
      height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)),
      hasAlpha: (b[20] & 0x10) !== 0,
    };
  }
  if (chunk === "VP8L" && b[20] === 0x2f) {
    const bits = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0;
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >>> 14) & 0x3fff) + 1,
      hasAlpha: ((bits >>> 28) & 1) === 1,
    };
  }
  if (chunk === "VP8 " && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) {
    return {
      width: (b[26] | (b[27] << 8)) & 0x3fff,
      height: (b[28] | (b[29] << 8)) & 0x3fff,
      hasAlpha: false,
    };
  }
  return EMPTY;
}

/** Reads dimensions and alpha channel presence from uploaded artwork bytes. */
export function inspectImage(bytes: ArrayBuffer | Uint8Array): ImageMeta {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length < 16) return EMPTY;

  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return png(b);
  if (b[0] === 0xff && b[1] === 0xd8) return jpeg(b);
  if (fourcc(b, 0) === "RIFF" && fourcc(b, 8) === "WEBP") return webp(b);
  return EMPTY;
}
