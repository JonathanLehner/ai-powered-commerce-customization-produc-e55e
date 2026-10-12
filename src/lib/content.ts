/**
 * Pages, blog posts and the header and footer menus.
 *
 * The rules shared by the workspace, the storefront, the Admin API and `npm run
 * content-check`: what a handle looks like, where an entry lives on the
 * storefront, how its fields are translated, and how a menu link resolves to an
 * address. Kept free of server imports; the HTML sanitiser lives in
 * `./rich-text` because it is only ever run on the server.
 */
import { localized, type FieldTranslations } from "./translations";
import type { ContentEntry, ContentKind, MenuItem, MenuLinkKind, Store, StoreMenus } from "./types";
import { slugify } from "./util";

export const CONTENT_KINDS = ["page", "post"] as const satisfies readonly ContentKind[];

export const CONTENT_LIMITS = {
  title: 120,
  handle: 80,
  excerpt: 400,
  seoTitle: 120,
  seoDescription: 320,
  /** Characters of HTML. A long article is well under this. */
  body: 200_000,
} as const;

export function isContentKind(value: unknown): value is ContentKind {
  return value === "page" || value === "post";
}

/** A handle is lower-case letters, digits and single hyphens: `about-us`. */
export function normalizeContentHandle(raw: string): string {
  return slugify(raw).slice(0, CONTENT_LIMITS.handle).replace(/-+$/, "");
}

export function isValidContentHandle(handle: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(handle) && handle.length <= CONTENT_LIMITS.handle;
}

/** A handle no other entry of the same kind uses: `faq`, then `faq-2`. */
export function uniqueContentHandle(base: string, taken: Iterable<string>, fallback: string): string {
  const used = new Set(taken);
  const root = normalizeContentHandle(base) || fallback;
  if (!used.has(root)) return root;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const candidate = `${root.slice(0, CONTENT_LIMITS.handle - suffix.length)}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}

/** Where an entry lives below the store's address. */
export function contentPath(kind: ContentKind, handle: string): string {
  return kind === "page" ? `/pages/${encodeURIComponent(handle)}` : `/blog/${encodeURIComponent(handle)}`;
}

export const BLOG_PATH = "/blog";

/* ------------------------------------------------------------- translations */

/** The fields a shopper reads, in the order the translation form shows them. */
export const CONTENT_FIELDS = ["title", "excerpt", "body", "seoTitle", "seoDescription"] as const;
export type ContentField = (typeof CONTENT_FIELDS)[number];

export function isContentField(key: string): key is ContentField {
  return (CONTENT_FIELDS as readonly string[]).includes(key);
}

type TranslatableEntry = Pick<ContentEntry, ContentField> & { translations?: FieldTranslations };

/** The entry as a shopper reads it in `locale`, each field falling back to the source. */
export function localizeEntry<E extends TranslatableEntry>(entry: E, locale: string, defaultLocale: string): E {
  if (locale === defaultLocale) return entry;
  const out = { ...entry };
  for (const key of CONTENT_FIELDS) {
    out[key] = localized(entry[key], entry.translations, locale, defaultLocale, key);
  }
  return out;
}

/** Text with the tags taken out, for previews and meta descriptions of trusted, sanitised HTML. */
export function textFromHtml(html: string): string {
  return html
    .replace(/<(br|\/p|\/h[1-6]|\/li|\/blockquote)\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

/** The summary a list or a search result shows: the excerpt, else the start of the body. */
export function entrySummary(entry: Pick<ContentEntry, "excerpt" | "body">, max = 200): string {
  const text = entry.excerpt.trim() || textFromHtml(entry.body).replace(/\n/g, " ");
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/* -------------------------------------------------------------------- menus */

export const MENU_NAMES = ["header", "footer"] as const;
export type MenuName = (typeof MENU_NAMES)[number];

export const MENU_LINK_KINDS = [
  "home",
  "products",
  "collection",
  "product",
  "page",
  "blog",
  "post",
  "url",
] as const satisfies readonly MenuLinkKind[];

export const MENU_LIMITS = { items: 20, label: 40, url: 500 } as const;

/** Link kinds that point at one record of the store. */
export const TARGETED_KINDS: readonly MenuLinkKind[] = ["collection", "product", "page", "post"];

export function isMenuName(value: unknown): value is MenuName {
  return value === "header" || value === "footer";
}

/** The store's menus. A store that never saved one has empty menus, which keep the built-in links. */
export function storeMenus(store: Pick<Store, "menus">): StoreMenus {
  return {
    header: store.menus?.header ?? [],
    footer: store.menus?.footer ?? [],
    updatedAt: store.menus?.updatedAt ?? "",
  };
}

/** An outside address a menu may link to: http(s), mailto or tel. */
export function isMenuUrl(value: string): boolean {
  if (value.length > MENU_LIMITS.url) return false;
  if (/^(mailto|tel):\S+$/i.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export type MenuProblem = "tooMany" | "labelRequired" | "labelTooLong" | "kindInvalid" | "targetMissing" | "urlInvalid";

/** The records a menu link may point at, by kind. */
export interface MenuTargets {
  collection: Set<string>;
  product: Set<string>;
  page: Set<string>;
  post: Set<string>;
}

/**
 * Checks a menu sent from the editor or the API and returns it cleaned up, or
 * the first problem with the item's index. Ids are kept when they look like
 * ours, so translations stay attached to their link across a reorder.
 */
export function cleanMenu(
  raw: unknown,
  targets: MenuTargets,
  newItemId: () => string,
): { items: MenuItem[] } | { problem: MenuProblem; index: number } {
  const list = Array.isArray(raw) ? raw : [];
  if (list.length > MENU_LIMITS.items) return { problem: "tooMany", index: MENU_LIMITS.items };
  const items: MenuItem[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of list.entries()) {
    const value = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    const label = String(value.label ?? "").trim();
    const kind = value.kind as MenuLinkKind;
    if (!label) return { problem: "labelRequired", index };
    if (label.length > MENU_LIMITS.label) return { problem: "labelTooLong", index };
    if (!(MENU_LINK_KINDS as readonly string[]).includes(kind)) return { problem: "kindInvalid", index };
    let targetId: string | null = null;
    let url: string | null = null;
    if (TARGETED_KINDS.includes(kind)) {
      targetId = String(value.targetId ?? "");
      if (!targets[kind as keyof MenuTargets].has(targetId)) return { problem: "targetMissing", index };
    } else if (kind === "url") {
      url = String(value.url ?? "").trim();
      if (!isMenuUrl(url)) return { problem: "urlInvalid", index };
    }
    const rawId = String(value.id ?? "");
    const id = /^mnu_[a-z0-9]{6,24}$/.test(rawId) && !seen.has(rawId) ? rawId : newItemId();
    seen.add(id);
    const translations = cleanLabelTranslations(value.translations);
    items.push({ id, label, kind, targetId, url, ...(translations ? { translations } : {}) });
  }
  return { items };
}

function cleanLabelTranslations(raw: unknown): FieldTranslations | null {
  if (!raw || typeof raw !== "object") return null;
  const out: FieldTranslations = {};
  for (const [locale, fields] of Object.entries(raw as Record<string, unknown>)) {
    const label = (fields as Record<string, { value?: unknown }> | null)?.label?.value;
    if (typeof label === "string" && label.trim() && label.trim().length <= MENU_LIMITS.label) {
      out[locale] = { label: { value: label.trim() } };
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** What a link's target resolves to, looked up from the store's records. */
export interface MenuLookups {
  collections: Map<string, string>;
  products: Map<string, string>;
  pages: Map<string, string>;
  posts: Map<string, string>;
}

/**
 * The address of a menu link on the storefront at `base`, or null when its
 * target is gone or no longer public. An outside address is returned as is.
 */
export function menuHref(item: Pick<MenuItem, "kind" | "targetId" | "url">, base: string, lookups: MenuLookups): string | null {
  const root = base || "/";
  const id = item.targetId ?? "";
  switch (item.kind) {
    case "home":
      return root;
    case "products":
      return `${base}/products`;
    case "blog":
      return `${base}${BLOG_PATH}`;
    case "collection": {
      const handle = lookups.collections.get(id);
      return handle ? `${base}/collections/${encodeURIComponent(handle)}` : null;
    }
    case "product": {
      const slug = lookups.products.get(id);
      return slug ? `${base}/products/${encodeURIComponent(slug)}` : null;
    }
    case "page": {
      const handle = lookups.pages.get(id);
      return handle ? `${base}${contentPath("page", handle)}` : null;
    }
    case "post": {
      const handle = lookups.posts.get(id);
      return handle ? `${base}${contentPath("post", handle)}` : null;
    }
    case "url":
      return item.url && isMenuUrl(item.url) ? item.url : null;
    default:
      return null;
  }
}

/** A menu as the storefront renders it: labels in `locale`, links that resolve, in order. */
export function resolveMenu(
  items: MenuItem[],
  base: string,
  lookups: MenuLookups,
  locale: string,
  defaultLocale: string,
): { id: string; label: string; href: string; external: boolean }[] {
  return items.flatMap((item) => {
    const href = menuHref(item, base, lookups);
    if (!href) return [];
    return [
      {
        id: item.id,
        label: localized(item.label, item.translations, locale, defaultLocale, "label"),
        href,
        external: item.kind === "url",
      },
    ];
  });
}
