import "server-only";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { storeLanguages } from "@/i18n/storefront-routing";
import {
  CONTENT_LIMITS,
  cleanMenu,
  isContentField,
  isValidContentHandle,
  normalizeContentHandle,
  storeMenus,
  uniqueContentHandle,
  type MenuName,
  type MenuProblem,
} from "../content";
import { listContentEntries } from "../content-data";
import { COLLECTIONS, listProductCollections, listStoreProducts, recordAudit, updateStore } from "../data";
import { db } from "../mongo";
import { isBlankRichText, sanitizeRichText } from "../rich-text";
import { withTranslation } from "../translations";
import type { ContentEntry, ContentKind, MenuItem, StoreMenus } from "../types";
import { isStoredAsset } from "../uploads";
import { newId } from "../util";
import { OperationError, type OperationContext } from "./context";

/**
 * Pages, blog posts and menus. The workspace's content actions and the Admin
 * API both run these, so a change made either way is checked, recorded and
 * revalidated the same.
 */

function audit(ctx: OperationContext, action: string, summary: string, entity: string, entityId: string) {
  recordAudit({
    category: "publishing",
    action,
    summary,
    storeId: ctx.store.id,
    agencyId: ctx.store.agencyId,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    entity,
    entityId,
    meta: {},
  });
}

function revalidateContent(ctx: OperationContext, entryId?: string) {
  revalidatePath(`/app/stores/${ctx.store.id}/content`);
  if (entryId) revalidatePath(`/app/stores/${ctx.store.id}/content/${entryId}`);
  revalidatePath(`/s/${ctx.store.slug}`, "layout");
}

const KIND_LABEL: Record<ContentKind, string> = { page: "page", post: "blog post" };

/** The entry, provided it belongs to the store. */
export async function findEntry(storeId: string, entryId: string): Promise<ContentEntry | null> {
  return db.findOne<ContentEntry>(COLLECTIONS.content, { storeId, id: entryId });
}

async function copy(ctx: OperationContext) {
  return getTranslations({ locale: ctx.locale, namespace: "actions.content" });
}

/**
 * Creates a draft page or post. A resubmitted form (double click, retry, a
 * stale tab) gets back the entry it already created.
 */
export async function createEntry(
  ctx: OperationContext,
  input: { kind: ContentKind; title: string; submissionKey: string | null },
): Promise<{ entry: ContentEntry; created: boolean }> {
  const t = await copy(ctx);
  const title = input.title.trim();
  if (title.length < 1) throw new OperationError("invalid", t("titleRequired"), "title");
  if (title.length > CONTENT_LIMITS.title) throw new OperationError("invalid", t("titleTooLong"), "title");

  if (input.submissionKey) {
    const already = await db.findOne<ContentEntry>(COLLECTIONS.content, {
      storeId: ctx.store.id,
      submissionKey: input.submissionKey,
    });
    if (already) return { entry: already, created: false };
  }

  const siblings = await listContentEntries(ctx.store.id, input.kind);
  const now = new Date().toISOString();
  const entry: ContentEntry = {
    id: newId("cnt"),
    storeId: ctx.store.id,
    kind: input.kind,
    title,
    handle: uniqueContentHandle(title, siblings.map((e) => e.handle), input.kind),
    body: "",
    excerpt: "",
    seoTitle: "",
    seoDescription: "",
    coverImageUrl: null,
    status: "draft",
    translations: {},
    authorName: ctx.actor.name,
    submissionKey: input.submissionKey,
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await db.insertOne(COLLECTIONS.content, entry as unknown as Record<string, unknown>);
  } catch (error) {
    // Two submissions racing for the same handle: the unique index turns one away.
    if ((error as { code?: number }).code !== 11000) throw error;
    throw new OperationError("conflict", t("handleTaken"), "title");
  }
  audit(ctx, `${entry.kind}.created`, `Created the ${KIND_LABEL[entry.kind]} “${title}”`, entry.kind, entry.id);
  revalidateContent(ctx);
  return { entry, created: true };
}

export interface EntryInput {
  title: string;
  handle: string;
  body: string;
  excerpt: string;
  seoTitle: string;
  seoDescription: string;
  coverImageUrl: string | null;
  status: ContentEntry["status"];
}

/** Saves an entry's fields. The body is sanitised before it is stored. */
export async function saveEntry(ctx: OperationContext, entry: ContentEntry, input: EntryInput): Promise<ContentEntry> {
  const t = await copy(ctx);
  const title = input.title.trim();
  const handle = normalizeContentHandle(input.handle);
  const excerpt = input.excerpt.trim();
  const seoTitle = input.seoTitle.trim();
  const seoDescription = input.seoDescription.trim();
  if (!title) throw new OperationError("invalid", t("titleRequired"), "title");
  if (title.length > CONTENT_LIMITS.title) throw new OperationError("invalid", t("titleTooLong"), "title");
  if (!isValidContentHandle(handle)) throw new OperationError("invalid", t("handleInvalid"), "handle");
  if (excerpt.length > CONTENT_LIMITS.excerpt) throw new OperationError("invalid", t("excerptTooLong"), "excerpt");
  if (seoTitle.length > CONTENT_LIMITS.seoTitle) throw new OperationError("invalid", t("seoTitleTooLong"), "seoTitle");
  if (seoDescription.length > CONTENT_LIMITS.seoDescription) {
    throw new OperationError("invalid", t("seoDescriptionTooLong"), "seoDescription");
  }
  if (input.body.length > CONTENT_LIMITS.body) throw new OperationError("invalid", t("bodyTooLong"), "body");
  if (input.coverImageUrl && !isStoredAsset(input.coverImageUrl)) {
    throw new OperationError("invalid", t("imageInvalid"), "coverImageUrl");
  }
  const body = sanitizeRichText(input.body);
  if (input.status === "published" && isBlankRichText(body)) {
    throw new OperationError("invalid", t("bodyRequired"), "body");
  }
  if (handle !== entry.handle) {
    const taken = await db.findOne<ContentEntry>(COLLECTIONS.content, {
      storeId: ctx.store.id,
      kind: entry.kind,
      handle,
      id: { $ne: entry.id },
    });
    if (taken) throw new OperationError("conflict", t("handleTaken"), "handle");
  }

  const now = new Date().toISOString();
  const publishing = input.status === "published" && entry.status !== "published";
  const next: ContentEntry = {
    ...entry,
    title,
    handle,
    body,
    excerpt,
    seoTitle,
    seoDescription,
    coverImageUrl: input.coverImageUrl,
    status: input.status,
    publishedAt: input.status === "published" ? (entry.publishedAt ?? now) : entry.publishedAt,
    updatedAt: now,
  };
  try {
    await db.updateOne(
      COLLECTIONS.content,
      { storeId: ctx.store.id, id: entry.id },
      {
        $set: {
          title,
          handle,
          body,
          excerpt,
          seoTitle,
          seoDescription,
          coverImageUrl: next.coverImageUrl,
          status: next.status,
          publishedAt: next.publishedAt,
          updatedAt: now,
        },
      },
    );
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    throw new OperationError("conflict", t("handleTaken"), "handle");
  }
  const kind = KIND_LABEL[entry.kind];
  if (publishing) audit(ctx, `${entry.kind}.published`, `Published the ${kind} “${title}”`, entry.kind, entry.id);
  else if (input.status === "draft" && entry.status === "published") {
    audit(ctx, `${entry.kind}.unpublished`, `Unpublished the ${kind} “${title}”`, entry.kind, entry.id);
  } else audit(ctx, `${entry.kind}.updated`, `Edited the ${kind} “${title}”`, entry.kind, entry.id);
  revalidateContent(ctx, entry.id);
  return next;
}

/**
 * Saves the entry's fields in one of the store's other languages. Keys are the
 * field names; an empty value removes that translation.
 */
export async function saveEntryTranslation(
  ctx: OperationContext,
  entry: ContentEntry,
  locale: string,
  values: Record<string, string>,
): Promise<ContentEntry["translations"]> {
  const t = await copy(ctx);
  const { locales, defaultLocale } = storeLanguages(ctx.store);
  if (!locales.includes(locale as never) || locale === defaultLocale) {
    throw new OperationError("invalid", t("languageInvalid"), "language");
  }
  let translations = entry.translations ?? {};
  for (const [key, raw] of Object.entries(values)) {
    if (!isContentField(key)) throw new OperationError("invalid", t("fieldInvalid", { key }), "values");
    const value = key === "body" ? sanitizeRichText(String(raw ?? "")) : String(raw ?? "").trim();
    const limit = CONTENT_LIMITS[key];
    if (value.length > limit) throw new OperationError("invalid", t("translationTooLong", { key }), "values");
    translations = withTranslation(translations, locale, key, key === "body" && isBlankRichText(value) ? "" : value);
  }
  await db.updateOne(
    COLLECTIONS.content,
    { storeId: ctx.store.id, id: entry.id },
    { $set: { translations, updatedAt: new Date().toISOString() } },
  );
  audit(
    ctx,
    `${entry.kind}.translated`,
    `Translated the ${KIND_LABEL[entry.kind]} “${entry.title}” into ${locale}`,
    entry.kind,
    entry.id,
  );
  revalidateContent(ctx, entry.id);
  return translations;
}

export async function deleteEntry(ctx: OperationContext, entry: ContentEntry): Promise<void> {
  await db.deleteOne(COLLECTIONS.content, { storeId: ctx.store.id, id: entry.id });
  // A menu link to it would lead nowhere: it is taken out of both menus.
  const menus = storeMenus(ctx.store);
  const keep = (items: MenuItem[]) => items.filter((item) => item.targetId !== entry.id);
  if (keep(menus.header).length !== menus.header.length || keep(menus.footer).length !== menus.footer.length) {
    const next: StoreMenus = { header: keep(menus.header), footer: keep(menus.footer), updatedAt: new Date().toISOString() };
    await updateStore(ctx.store.id, { menus: next });
  }
  audit(ctx, `${entry.kind}.deleted`, `Deleted the ${KIND_LABEL[entry.kind]} “${entry.title}”`, entry.kind, entry.id);
  revalidateContent(ctx);
}

/* -------------------------------------------------------------------- menus */

const MENU_PROBLEMS = {
  tooMany: "menuTooMany",
  labelRequired: "menuLabelRequired",
  labelTooLong: "menuLabelTooLong",
  kindInvalid: "menuKindInvalid",
  targetMissing: "menuTargetMissing",
  urlInvalid: "menuUrlInvalid",
} as const satisfies Record<MenuProblem, string>;

/** Replaces one menu with the links given, in that order. */
export async function saveMenu(ctx: OperationContext, name: MenuName, raw: unknown): Promise<StoreMenus> {
  const t = await copy(ctx);
  const [collections, products, entries] = await Promise.all([
    listProductCollections(ctx.store.id),
    listStoreProducts(ctx.store.id),
    listContentEntries(ctx.store.id),
  ]);
  const cleaned = cleanMenu(
    raw,
    {
      collection: new Set(collections.map((c) => c.id)),
      product: new Set(products.filter((p) => p.status !== "archived").map((p) => p.id)),
      page: new Set(entries.filter((e) => e.kind === "page").map((e) => e.id)),
      post: new Set(entries.filter((e) => e.kind === "post").map((e) => e.id)),
    },
    () => newId("mnu"),
  );
  if ("problem" in cleaned) {
    throw new OperationError(
      "invalid",
      t(MENU_PROBLEMS[cleaned.problem], { position: cleaned.index + 1 }),
      `items.${cleaned.index}`,
    );
  }
  const current = storeMenus(ctx.store);
  const next: StoreMenus = { ...current, [name]: cleaned.items, updatedAt: new Date().toISOString() };
  await updateStore(ctx.store.id, { menus: next });
  audit(ctx, "menu.saved", `Saved the ${name} menu (${cleaned.items.length} links)`, "menu", name);
  revalidatePath(`/app/stores/${ctx.store.id}/content/menus`);
  revalidatePath(`/s/${ctx.store.slug}`, "layout");
  return next;
}
