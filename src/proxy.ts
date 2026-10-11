import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, MARKETING_PATHS, isLocale, type Locale } from "@/i18n/locales";
import { routing } from "@/i18n/routing";
import { negotiateShopperLocale } from "@/i18n/shopper-negotiation";
import { SHOPPER_LOCALE_COOKIE, storeLanguages } from "@/i18n/storefront-routing";
import { isLive } from "@/lib/artwork";
import {
  getGiftCatalogueBySlug,
  getProductCollectionByHandle,
  getStore,
  getStoreByDomain,
  getStoreBySlug,
  getStoreProductBySlug,
} from "@/lib/data";
import { matchesRoute, segmentsOf } from "@/lib/routes";
import { SITE_ORIGIN } from "@/lib/seo";
import type { Store } from "@/lib/types";

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
  //
  // `/sitemap.xml` and `/robots.txt` are files on the platform host, but on a
  // store's custom domain they are the store's own, so proxy sees them too.
  matcher: ["/((?!_next/static|_next/image|api/auth/|.*\\.[a-zA-Z0-9]+$).*)", "/sitemap.xml", "/robots.txt"],
};

const localizeMarketing = createMiddleware(routing);

/**
 * `/pricing` or `/de/pricing`: a public page, in English at the root or in
 * another language under its prefix.
 */
function isMarketingAddress(pathname: string): boolean {
  const segments = segmentsOf(pathname);
  const rest = isLocale(segments[0]) ? segments.slice(1) : segments;
  return (MARKETING_PATHS as readonly string[]).includes(`/${rest.join("/")}`);
}

export async function proxy(request: NextRequest): Promise<NextResponse | undefined> {
  // A generated share image is requested at its page's internal address, which
  // already names the language, so it is served as it is.
  if (isShareImage(request.nextUrl.pathname)) return undefined;

  const domainStore = await customDomainStore(request);
  if (domainStore) {
    const served = await serveCustomDomain(request, domainStore);
    if (served) return served;
  }
  if (request.nextUrl.pathname === "/sitemap.xml" || request.nextUrl.pathname === "/robots.txt") return undefined;

  // The public pages live under `[locale]`. next-intl serves English at the
  // root by rewriting `/pricing` to `/en/pricing`, and sends `/en/pricing` back
  // to `/pricing`. Server actions post to the page address too, so this runs
  // for every method.
  if (isMarketingAddress(request.nextUrl.pathname)) return localizeMarketing(request);

  const segments = segmentsOf(request.nextUrl.pathname);
  if ((segments[0] === "s" || segments[0] === "g") && segments.length >= 2) {
    return localizeShopper(request, segments);
  }

  // Reads only. A server action posts to the address the page is on, and its
  // response is a payload the browser is waiting on rather than a page anyone
  // navigated to; a status of 404 there would say something about the action,
  // which is not what is being judged here.
  if (request.method !== "GET" && request.method !== "HEAD") return undefined;

  return isMissing(request.nextUrl.pathname) ? NextResponse.next({ status: 404 }) : undefined;
}

/** `…/opengraph-image-1a2b3c` and `…/twitter-image-1a2b3c`, the routes Next generates share images at. */
function isShareImage(pathname: string): boolean {
  return /\/(opengraph|twitter)-image(-[\w]+)?$/.test(pathname);
}

const PLATFORM_HOST = new URL(SITE_ORIGIN).hostname;

/**
 * Hosts that are the platform itself, never a store's domain: they skip the
 * domain lookup, so the marketing site and the workspace pay nothing for it.
 */
function isPlatformHost(host: string): boolean {
  return (
    host === PLATFORM_HOST ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".clawcorp.ai") ||
    host.endsWith(".workers.dev") ||
    host.startsWith("[") ||
    /^\d+(\.\d+){3}$/.test(host)
  );
}

/** The store whose custom domain this request was sent to, if any. */
async function customDomainStore(request: NextRequest): Promise<Store | null> {
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "")
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");
  if (!host || isPlatformHost(host)) return null;
  try {
    return await getStoreByDomain(host);
  } catch {
    return null;
  }
}

/**
 * A request on a store's custom domain. `/products/field-tee` there is
 * `/s/<slug>/products/field-tee` here, and `/sitemap.xml` and `/robots.txt`
 * are the store's own. The platform's internal addresses (`/s/…`, `/_next`,
 * `/api`) keep working, since the pages link to them; those return null and
 * are handled as on the platform host.
 */
async function serveCustomDomain(request: NextRequest, store: Store): Promise<NextResponse | null> {
  const { pathname } = request.nextUrl;
  if (pathname === "/sitemap.xml" || pathname === "/robots.txt") {
    const url = request.nextUrl.clone();
    url.pathname = `/s/${store.slug}${pathname}`;
    return NextResponse.rewrite(url);
  }
  const segments = segmentsOf(pathname);
  if (["s", "g", "api", "_next"].includes(segments[0] ?? "")) return null;
  return localizeShopper(request, ["s", store.slug, ...segments], { store, publicRoot: "" });
}

const isRead = (request: NextRequest) => request.method === "GET" || request.method === "HEAD";

/**
 * A storefront or gift portal address. The pages live under `[locale]`, so the
 * address is rewritten to carry the language: the one in the path when the
 * store has enabled it, otherwise the shopper's cookie, then their browser's
 * languages, then the store default. A language other than the default is
 * always shown in the address, so a negotiated one redirects to its prefix and
 * a prefixed default redirects back to the plain address. A language the store
 * has not enabled serves the default-language page.
 *
 * The rewrite also names the language in next-intl's request header, which is
 * how server actions posted from a page read it.
 */
async function localizeShopper(
  request: NextRequest,
  segments: string[],
  known?: { store: Store; publicRoot: string },
): Promise<NextResponse> {
  const [surface, slug, ...after] = segments;
  const requested = isLocale(after[0]) ? after[0] : null;
  const rest = requested ? after.slice(1) : after;
  const root = `/${surface}/${slug}`;
  // Where redirects point: the surface's own address, or the bare custom domain.
  const publicRoot = known ? known.publicRoot : root;
  const restPath = rest.length > 0 ? `/${rest.join("/")}` : "";
  const read = isRead(request);

  let store: Store | null | undefined = known?.store;
  if (!known) {
    try {
      store = await storeFor(surface, decodeSegment(slug));
    } catch {
      store = undefined;
    }
  }
  const { locales, defaultLocale } = store
    ? storeLanguages(store)
    : { locales: [DEFAULT_LOCALE], defaultLocale: DEFAULT_LOCALE };

  let locale: Locale;
  if (requested) {
    locale = locales.includes(requested) ? requested : defaultLocale;
    if (read && requested === defaultLocale) {
      return remember(redirectTo(request, `${publicRoot}${restPath}` || "/"), request, requested);
    }
  } else {
    locale = read
      ? negotiateShopperLocale(
          {
            cookie: request.cookies.get(SHOPPER_LOCALE_COOKIE)?.value,
            acceptLanguage: request.headers.get("accept-language"),
          },
          { locales, defaultLocale },
        )
      : defaultLocale;
    if (locale !== defaultLocale) return redirectTo(request, `${publicRoot}/${locale}${restPath}`);
  }

  const missing = read && (await shopperMissing(`${root}${restPath}`, store, rest));
  const url = request.nextUrl.clone();
  url.pathname = `${root}/${locale}${restPath}`;
  const headers = new Headers(request.headers);
  headers.set("X-NEXT-INTL-LOCALE", locale);
  const response = NextResponse.rewrite(url, { request: { headers }, ...(missing ? { status: 404 } : {}) });
  return read && requested && locales.includes(requested) ? remember(response, request, requested) : response;
}

/** The store a storefront or gift portal address belongs to. */
async function storeFor(surface: string, slug: string): Promise<Store | null> {
  if (surface === "s") return getStoreBySlug(slug);
  const catalogue = await getGiftCatalogueBySlug(slug);
  return catalogue ? getStore(catalogue.storeId) : null;
}

function redirectTo(request: NextRequest, pathname: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  return NextResponse.redirect(url);
}

/** Keeps the language a shopper opened, so the plain address serves it next time. */
function remember(response: NextResponse, request: NextRequest, locale: Locale): NextResponse {
  if (request.cookies.get(SHOPPER_LOCALE_COOKIE)?.value !== locale) {
    response.cookies.set(SHOPPER_LOCALE_COOKIE, locale, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return response;
}

/**
 * An address that matches no page at all: a `[...rest]` catch-all answers it
 * with the not-found body of the surface it was aimed at, or (outside every
 * surface) the site-wide not-found page does.
 */
function isMissing(pathname: string): boolean {
  return !matchesRoute(pathname);
}

/**
 * A shop or gift portal address: the slug has to belong to a store, and a
 * product page to a product on sale. `store` is undefined when the database
 * could not be reached; the page is about to run the same reads and will say
 * so in its own words, so a status is not worth failing over.
 */
async function shopperMissing(
  pathname: string,
  store: Store | null | undefined,
  rest: string[],
): Promise<boolean> {
  if (isMissing(pathname)) return true;
  if (store === undefined) return false;
  if (!store) return true;
  if (!pathname.startsWith("/s/") || rest.length !== 2) return false;
  try {
    if (rest[0] === "products") {
      const product = await getStoreProductBySlug(store.id, decodeSegment(rest[1]));
      return !(product != null && isLive(product));
    }
    if (rest[0] === "collections") {
      return (await getProductCollectionByHandle(store.id, decodeSegment(rest[1]))) == null;
    }
    return false;
  } catch {
    return false;
  }
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
