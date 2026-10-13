import type { AiSuggestion, SuggestionKind } from "./types";

/**
 * Pending assistant suggestions as the assistant page shows them: one group
 * per product, newest first. A suggestion is superseded once a newer pending
 * one of the same kind exists for the same product, or once one was recorded
 * as replacing it when it arrived. Superseded suggestions stay pending: they
 * can still be applied or dismissed, one click each.
 */

export interface PendingEntry {
  suggestion: AiSuggestion;
  superseded: boolean;
}

export interface PendingGroup {
  /** The product id, or the kind for suggestions not tied to a store product. */
  key: string;
  productId: string | null;
  kind: SuggestionKind | null;
  current: PendingEntry[];
  older: PendingEntry[];
}

/** Product ideas and supplier recommendations are not about a store product, so nothing supersedes them. */
export function supersedes(kind: SuggestionKind, productId: string | null): boolean {
  return productId !== null && kind !== "product_idea" && kind !== "supplier";
}

export function groupPendingSuggestions(pending: AiSuggestion[]): PendingGroup[] {
  const sorted = pending
    .filter((s) => s.status === "pending")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const groups = new Map<string, PendingGroup>();
  const latest = new Set<string>();

  for (const suggestion of sorted) {
    const key = suggestion.productId ?? suggestion.kind;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        productId: suggestion.productId,
        kind: suggestion.productId ? null : suggestion.kind,
        current: [],
        older: [],
      };
      groups.set(key, group);
    }
    let superseded = false;
    if (supersedes(suggestion.kind, suggestion.productId)) {
      const slot = `${suggestion.productId}:${suggestion.kind}`;
      superseded = latest.has(slot) || Boolean(suggestion.supersededBy);
      latest.add(slot);
    }
    (superseded ? group.older : group.current).push({ suggestion, superseded });
  }
  return [...groups.values()];
}

/** The ids among `ids` that are pending and superseded right now. */
export function supersededIds(pending: AiSuggestion[], ids?: string[]): string[] {
  const older = groupPendingSuggestions(pending).flatMap((g) => g.older.map((e) => e.suggestion.id));
  return ids ? older.filter((id) => ids.includes(id)) : older;
}
