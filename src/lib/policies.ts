/**
 * A store's shopper-facing policies: refunds and returns, shipping, terms of
 * sale and privacy.
 *
 * Every store has all four from the start: the built-in text is the
 * `storePolicies` namespace of the messages files, in the shopper's language.
 * What the store writes in setup is kept per language and replaces it. A
 * language the store has not written falls back to the store's own text in its
 * default language before the built-in text, so a shopper never reads a policy
 * the store has replaced. Kept free of server imports: the proxy, the setup
 * editor and the check scripts read it too.
 */
import type { Store } from "./types";

export const POLICY_KEYS = ["refunds", "shipping", "terms", "privacy"] as const;

export type PolicyKey = (typeof POLICY_KEYS)[number];

/** The store's own policy text, per language, then per policy. */
export type StorePolicies = Partial<Record<string, Partial<Record<PolicyKey, string>>>>;

/** Longer than any policy a shop needs, short enough to keep the record small. */
export const POLICY_MAX_LENGTH = 20000;

export function isPolicyKey(value: string): value is PolicyKey {
  return (POLICY_KEYS as readonly string[]).includes(value);
}

/** The address of a policy below a storefront or gift portal language root. */
export function policyPath(base: string, key: PolicyKey): string {
  return `${base}/policies/${key}`;
}

/** Line endings and surrounding blank space do not make two texts different. */
export function normalizePolicy(text: string): string {
  return text.replace(/\r\n?/g, "\n").trim();
}

/**
 * The text the store wrote for a policy in `locale`, else in its default
 * language, else null for the built-in text.
 */
export function storePolicyText(
  store: Pick<Store, "policies">,
  key: PolicyKey,
  locale: string,
  defaultLocale: string,
): string | null {
  const own = store.policies?.[locale]?.[key] ?? store.policies?.[defaultLocale]?.[key];
  return own && own.trim() ? own : null;
}

export type PolicyBlock = { type: "heading" | "paragraph"; text: string };

/**
 * Policy text is plain text: blank lines separate paragraphs and a line that
 * starts with `## ` is a heading.
 */
export function policyBlocks(text: string): PolicyBlock[] {
  const blocks: PolicyBlock[] = [];
  for (const chunk of normalizePolicy(text).split(/\n{2,}/)) {
    const lines = chunk.split("\n");
    while (lines.length && lines[0].startsWith("## ")) {
      const heading = lines.shift()!.slice(3).trim();
      if (heading) blocks.push({ type: "heading", text: heading });
    }
    const paragraph = lines.join("\n").trim();
    if (paragraph) blocks.push({ type: "paragraph", text: paragraph });
  }
  return blocks;
}
