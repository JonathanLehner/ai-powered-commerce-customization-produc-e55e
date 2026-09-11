import { NextResponse, type NextRequest } from "next/server";
import { isLive } from "@/lib/artwork";
import { getGiftCatalogueBySlug, getStoreBySlug, getStoreProductBySlug } from "@/lib/data";
import { matchesRoute, segmentsOf } from "@/lib/routes";

/**
 * Gives the branded "we cannot find that" screens a 404 status.
 *
 * The screens themselves are pages, not `notFound()` boundaries, because a
 * boundary does not recover during server rendering and the response would be a
 * document with an empty `<body>` — see `@/components/NotFoundViews`. A page
 * that renders normally is a 200, though, and the status is what search engines
 * and uptime monitors read: a missing shop, a retired product and a mistyped
 * workspace address all looked like working pages.
 *
 * A status can only be set before the response starts streaming, so the check
 * has to run before the render — which is what middleware is. It decides the
 * status only; the body is still the page's own render of live data, so a stale
 * answer here can never show the wrong page, only briefly label the right one
 * wrongly.
 *
 * This is `middleware.ts` on the edge runtime rather than Next 16's `proxy.ts`
 * on purpose: proxy is always Node.js, which the OpenNext Cloudflare adapter
 * the app deploys through does not support.
 */
export const config = {
  // Everything but the framework's own assets and the files in `public/`, which
  // are served by the filesystem and are not addresses anyone can mistype.
  matcher: ["/((?!_next/static|_next/image|.*\\.[a-zA-Z0-9]+$).*)"],
};

export async function middleware(request: NextRequest): Promise<NextResponse | undefined> {
  // Reads only. A server action posts to the address the page is on, and its
  // response is a payload the browser is waiting on rather than a page anyone
  // navigated to; a status of 404 there would say something about the action,
  // which is not what is being judged here.
  if (request.method !== "GET" && request.method !== "HEAD") return undefined;

  return (await isMissing(request.nextUrl.pathname))
    ? NextResponse.next({ status: 404 })
    : undefined;
}

async function isMissing(pathname: string): Promise<boolean> {
  // An address that matches no page at all: a `[...rest]` catch-all answers it
  // with the not-found body of the surface it was aimed at, or — outside every
  // surface — the site-wide not-found page does.
  if (!matchesRoute(pathname)) return true;

  const [surface, slug, ...rest] = segmentsOf(pathname).map(decodeSegment);
  try {
    if (surface === "s") return await storefrontMissing(slug, rest);
    if (surface === "g") return !(await remember(`g:${slug}`, () => exists(getGiftCatalogueBySlug(slug))));
  } catch {
    // The platform API is down or slow. The page is about to run the same reads
    // and will say so in its own words; a status is not worth failing over.
    return false;
  }
  return false;
}

/** A shop address: the slug has to belong to a store, and a product page to a product on sale. */
async function storefrontMissing(slug: string, rest: string[]): Promise<boolean> {
  const store = await remember(`s:${slug}`, async () => (await getStoreBySlug(slug))?.id ?? null);
  if (!store) return true;
  if (rest[0] !== "products" || rest.length !== 2) return false;
  return !(await remember(`p:${store}:${rest[1]}`, async () => {
    const product = await getStoreProductBySlug(store, rest[1]);
    return product != null && isLive(product);
  }));
}

/** A lookup that answers with the record, or with nothing when there is none. */
async function exists(lookup: Promise<unknown>): Promise<boolean> {
  return (await lookup) != null;
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/* ------------------------------------------------------------------ caching */

/**
 * Proxy runs on every request, and these are reads the page is about to make
 * again — a round trip to the platform API costs around half a second, so
 * paying it twice per shop page would be felt. The answers are kept for ten
 * seconds, the same window the data layer keeps stores in, and they are only
 * ever used to choose the status code: a product published in the last ten
 * seconds is served as a 404 for the rest of that window, with its own page in
 * the body.
 */
const TTL_MS = 10_000;
const MAX_ENTRIES = 500;
const answers = new Map<string, { until: number; value: Promise<unknown> }>();

function remember<T>(key: string, lookup: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = answers.get(key);
  if (hit && hit.until > now) return hit.value as Promise<T>;

  const value = lookup().catch((error: unknown) => {
    answers.delete(key);
    throw error;
  });
  if (answers.size >= MAX_ENTRIES) {
    for (const [existing, entry] of answers) {
      if (entry.until <= now) answers.delete(existing);
    }
    // Still full: the oldest insertions go, Map iteration being insertion-ordered.
    while (answers.size >= MAX_ENTRIES) {
      const oldest = answers.keys().next();
      if (oldest.done) break;
      answers.delete(oldest.value);
    }
  }
  answers.set(key, { until: now + TTL_MS, value });
  return value;
}
