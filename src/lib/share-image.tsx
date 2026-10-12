import "server-only";
import { ImageResponse } from "next/og";
import { THEMES, type ThemeKey } from "./types";

/**
 * The generated share images: what a link to a storefront, a product or the
 * marketing site shows when it is pasted into a chat or a feed. Drawn with
 * `ImageResponse` at the size Open Graph and Twitter both crop well.
 */
export const SHARE_SIZE = { width: 1200, height: 630 };

/** Formats `ImageResponse` can draw. WebP is not one of them. */
const DRAWABLE = ["image/png", "image/jpeg", "image/gif", "image/svg+xml"];

/**
 * An image as a data URI the renderer can draw, or null when it cannot be
 * fetched in time or is in a format it cannot read. A missing picture leaves
 * the card without it rather than failing the whole image.
 */
export async function drawableImage(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
    const type = (response.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!response.ok || !DRAWABLE.includes(type)) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return `data:${type};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** The store's logo, or its initials on its accent colour. */
function Mark({ name, logo, accent, size }: { name: string; logo: string | null; accent: string; size: number }) {
  if (logo) {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img src={logo} height={size} style={{ height: size, maxWidth: size * 3, objectFit: "contain" }} />;
  }
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: size / 2,
        background: accent,
        color: "#ffffff",
        fontSize: size * 0.4,
      }}
    >
      {initials(name)}
    </div>
  );
}

/** A storefront's card: logo, name and description in the store's colours. */
export function storeShareImage(input: {
  theme: ThemeKey;
  name: string;
  description: string;
  logo: string | null;
}): ImageResponse {
  const theme = THEMES[input.theme] ?? THEMES.atelier;
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: 72,
          background: theme.surface,
          color: theme.ink,
          borderTop: `16px solid ${theme.accent}`,
        }}
      >
        <Mark name={input.name} logo={input.logo} accent={theme.accent} size={120} />
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 76, lineHeight: 1.05, letterSpacing: -1.5 }}>{input.name}</div>
          <div style={{ fontSize: 32, lineHeight: 1.35, opacity: 0.75, maxWidth: 980 }}>{input.description}</div>
        </div>
      </div>
    ),
    SHARE_SIZE,
  );
}

/** A product's card: its picture, name and price, in the store's colours. */
export function productShareImage(input: {
  theme: ThemeKey;
  storeName: string;
  logo: string | null;
  name: string;
  price: string;
  image: string | null;
}): ImageResponse {
  const theme = THEMES[input.theme] ?? THEMES.atelier;
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: theme.surface, color: theme.ink }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 630,
            height: 630,
            background: "#ffffff",
          }}
        >
          {input.image ? (
            // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
            <img src={input.image} width={630} height={630} style={{ objectFit: "cover" }} />
          ) : (
            <Mark name={input.storeName} logo={input.logo} accent={theme.accent} size={200} />
          )}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            flex: 1,
            padding: 56,
            borderLeft: `12px solid ${theme.accent}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <Mark name={input.storeName} logo={input.logo} accent={theme.accent} size={56} />
            <div style={{ fontSize: 26, opacity: 0.75 }}>{input.storeName}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ fontSize: 56, lineHeight: 1.1, letterSpacing: -1 }}>{input.name}</div>
            <div
              style={{
                display: "flex",
                alignSelf: "flex-start",
                padding: "10px 24px",
                borderRadius: 999,
                background: theme.accent,
                color: "#ffffff",
                fontSize: 40,
              }}
            >
              {input.price}
            </div>
          </div>
        </div>
      </div>
    ),
    SHARE_SIZE,
  );
}

/** Parcelith's own card for a marketing page: the brand, then the page title and description on white. */
export function siteShareImage(input: { logo: string; title: string; description: string }): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: 72,
          background: "#ffffff",
          color: "#0f172a",
          borderTop: "16px solid #0b807c",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
          <img src={input.logo} height={96} style={{ height: 96, objectFit: "contain" }} />
          <div style={{ fontSize: 44, letterSpacing: -1, color: "#0f172a" }}>Parcelith</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 64, lineHeight: 1.1, letterSpacing: -1.5, maxWidth: 1000 }}>{input.title}</div>
          <div style={{ fontSize: 30, lineHeight: 1.4, color: "#475569", maxWidth: 980 }}>{input.description}</div>
        </div>
      </div>
    ),
    SHARE_SIZE,
  );
}
