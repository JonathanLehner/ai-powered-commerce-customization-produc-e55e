import "server-only";
import { COLLECTIONS } from "./data";
import { db } from "./mongo";
import type { ContentEntry, ContentKind } from "./types";

/** Reads of a store's pages and blog posts. Every read is scoped to one store. */

/** Every entry of the store, or of one kind, newest first. */
export function listContentEntries(storeId: string, kind?: ContentKind): Promise<ContentEntry[]> {
  return db.find<ContentEntry>(COLLECTIONS.content, { storeId, ...(kind ? { kind } : {}) }, { sort: { updatedAt: -1 } });
}

/** The published entries, posts newest first. */
export function listPublishedContent(storeId: string, kind?: ContentKind): Promise<ContentEntry[]> {
  return db.find<ContentEntry>(
    COLLECTIONS.content,
    { storeId, status: "published", ...(kind ? { kind } : {}) },
    { sort: { publishedAt: -1, id: -1 } },
  );
}

/** One published entry by its address. */
export function getPublishedEntry(storeId: string, kind: ContentKind, handle: string): Promise<ContentEntry | null> {
  return db.findOne<ContentEntry>(COLLECTIONS.content, { storeId, kind, handle, status: "published" });
}
