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
 * has to run before the render — which is what proxy is. It decides the
 * status only; the body is still the page's own render of live data.
 *
 * It is Next 16's `proxy.ts`, which runs on Node.js, because the MongoDB driver
 * needs sockets and the edge runtime's bundle stubs them out. OpenNext bundles
 * a Node.js proxy for workerd, where `nodejs_compat` provides them.
 */
export const config = {
  // Everything but the framework's own assets and the files in `public/`, which
  // are served by the filesystem and are not addresses anyone can mistype.
  //
  // `/api/auth/*` is exempt as well: Auth.js owns those endpoints through a
  // catch-all, so they are deliberately absent from `@/lib/routes` — which here
  // would read as "no such address" and label a working session or csrf
  // response 404.
  matcher: ["/((?!_next/static|_next/image|api/auth/|.*\\.[a-zA-Z0-9]+$).*)"],
};

export async function proxy(request: NextRequest): Promise<NextResponse | undefined> {
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
    if (surface === "g") return !(await exists(getGiftCatalogueBySlug(slug)));
  } catch {
    // The database is unreachable. The page is about to run the same reads
    // and will say so in its own words; a status is not worth failing over.
    return false;
  }
  return false;
}

/** A shop address: the slug has to belong to a store, and a product page to a product on sale. */
async function storefrontMissing(slug: string, rest: string[]): Promise<boolean> {
  const store = await getStoreBySlug(slug);
  if (!store) return true;
  if (rest[0] !== "products" || rest.length !== 2) return false;
  const product = await getStoreProductBySlug(store.id, rest[1]);
  return !(product != null && isLive(product));
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
