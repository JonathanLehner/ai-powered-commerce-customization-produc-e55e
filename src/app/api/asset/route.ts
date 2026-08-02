import type { NextRequest } from "next/server";

/**
 * Re-serves an asset-host image from this origin.
 *
 * The asset host sends no CORS headers, so the configurator cannot draw those
 * images into a canvas without tainting it. Reading them back through this
 * handler makes every mockup source same-origin. Only the asset host is
 * reachable — the URL is not a general-purpose fetch target.
 */
const ALLOWED_ORIGIN = "https://assets.clawcorp.ai";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"];

export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get("u");
  if (!target) return new Response("Missing asset", { status: 400 });

  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return new Response("Invalid asset", { status: 400 });
  }
  if (url.origin !== ALLOWED_ORIGIN) return new Response("Asset not allowed", { status: 403 });

  const upstream = await fetch(url, { cache: "force-cache" });
  if (!upstream.ok || !upstream.body) {
    return new Response("Asset unavailable", { status: 502 });
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (!ALLOWED_TYPES.some((type) => contentType.startsWith(type))) {
    return new Response("Asset not allowed", { status: 415 });
  }

  return new Response(upstream.body, {
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
