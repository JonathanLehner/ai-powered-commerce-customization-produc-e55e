import { sectionsFromTree, type SectionType } from "./storefront-schema";
import type { StorefrontVersion } from "./types";

/** A section as the version history compares it: its node, type and a fingerprint of its settings. */
export interface SectionSummary {
  id: string;
  type: SectionType;
  sig: string;
}

export interface SectionChange {
  id: string;
  type: SectionType;
}

export interface VersionDiff {
  added: SectionChange[];
  removed: SectionChange[];
  moved: SectionChange[];
  edited: SectionChange[];
}

/** How many entries of each kind the history keeps. */
export const HISTORY_LIMITS = { published: 10, draft: 5 } as const;

/** JSON with sorted keys, so two trees with the same settings compare equal. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function sameTree(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

export function summarizeSections(tree: unknown): SectionSummary[] {
  return sectionsFromTree(tree).map(({ id, type, props }) => ({ id, type, sig: hash(stableStringify(props)) }));
}

export function sameSections(a: SectionSummary[], b: SectionSummary[]): boolean {
  return a.length === b.length && a.every((s, i) => s.type === b[i].type && s.sig === b[i].sig);
}

export function versionKind(version: Pick<StorefrontVersion, "kind">): "published" | "draft" {
  return version.kind ?? "published";
}

/**
 * What `next` changes compared with `base`. Sections are matched by node id,
 * then any left over are paired by type in page order, so layouts built
 * separately still line up.
 */
export function diffSections(base: SectionSummary[], next: SectionSummary[]): VersionDiff {
  const pairs = new Map<number, number>(); // next index -> base index
  const usedBase = new Set<number>();
  const baseById = new Map(base.map((s, i) => [s.id, i]));
  next.forEach((s, i) => {
    const j = baseById.get(s.id);
    if (j !== undefined && base[j].type === s.type) {
      pairs.set(i, j);
      usedBase.add(j);
    }
  });
  next.forEach((s, i) => {
    if (pairs.has(i)) return;
    const j = base.findIndex((b, k) => !usedBase.has(k) && b.type === s.type);
    if (j >= 0) {
      pairs.set(i, j);
      usedBase.add(j);
    }
  });

  const added = next.filter((_, i) => !pairs.has(i)).map(({ id, type }) => ({ id, type }));
  const removed = base.filter((_, j) => !usedBase.has(j)).map(({ id, type }) => ({ id, type }));
  const edited = next.filter((s, i) => pairs.has(i) && base[pairs.get(i)!].sig !== s.sig).map(({ id, type }) => ({ id, type }));

  // Sections kept in place are the longest run that keeps the old order; the
  // rest were moved.
  const kept = next.map((_, i) => i).filter((i) => pairs.has(i));
  const order = kept.map((i) => pairs.get(i)!);
  const lis = new Array(order.length).fill(1);
  const prev = new Array(order.length).fill(-1);
  for (let a = 0; a < order.length; a++) {
    for (let b = 0; b < a; b++) {
      if (order[b] < order[a] && lis[b] + 1 > lis[a]) {
        lis[a] = lis[b] + 1;
        prev[a] = b;
      }
    }
  }
  const inPlace = new Set<number>();
  let end = lis.reduce((best, len, i) => (len > lis[best] ? i : best), 0);
  while (order.length > 0 && end >= 0) {
    inPlace.add(end);
    end = prev[end];
  }
  const moved = kept.filter((_, k) => !inPlace.has(k)).map((i) => ({ id: next[i].id, type: next[i].type }));

  return { added, removed, moved, edited };
}

export function isUnchanged(diff: VersionDiff): boolean {
  return diff.added.length + diff.removed.length + diff.moved.length + diff.edited.length === 0;
}

/** Newest first, keeping a fixed number of published versions and saved drafts. */
export function capHistory(history: StorefrontVersion[]): StorefrontVersion[] {
  const counts = { published: 0, draft: 0 };
  return history.filter((v) => {
    const kind = versionKind(v);
    counts[kind] += 1;
    return counts[kind] <= HISTORY_LIMITS[kind];
  });
}

/** The history entry the live storefront was published from, if it is still kept. */
export function liveVersionId(history: StorefrontVersion[], published: unknown): string | null {
  if (!published) return null;
  const live = summarizeSections(published);
  const candidates = history.filter((v) => versionKind(v) === "published");
  return (candidates.find((v) => sameSections(summarizeSections(v.data), live)) ?? null)?.id ?? null;
}
