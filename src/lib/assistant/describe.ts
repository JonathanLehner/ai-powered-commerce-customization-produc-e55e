/**
 * What a confirmation card says about a call the assistant wants to run, in
 * the words of the person confirming it: "15% off any order with code
 * WELCOME15, until the end of 30 November 2026" rather than its arguments.
 *
 * The main calls get a sentence; every other argument is listed under its
 * label from `field-labels.ts`, with values formatted for the person (money,
 * dates, languages, countries, names instead of ids). Pure, so
 * `npm run assistant-chat-check` exercises it without a database; the names
 * and current values it needs are read by the caller.
 */
import { localCountryName } from "../countries";
import { minorFactor } from "../util";
import { FIELD_LABELS } from "./field-labels";

export interface CallDescription {
  /** Sentences saying what will happen, most important first. */
  summary: string[];
  /** The other arguments, labelled and formatted. */
  details: { label: string; value: string }[];
  links: { label: string; href: string; external?: boolean }[];
}

export interface DiscountTerms {
  code: string;
  kind: "percentage" | "fixed";
  value: number;
  currency: string;
  minimumSubtotal: number;
  /** YYYY-MM-DD, or a full timestamp for the end of that day. */
  expiresAt: string | null;
  usageLimit: number | null;
  active: boolean;
}

export interface DescribeContext {
  locale: string;
  store: { id: string; defaultCurrency: string; currencies: string[]; languages: string[]; defaultLanguage: string };
  /** `assistantChat.describe` messages. */
  t(key: string, values?: Record<string, string | number>): string;
  /** Display names of the records the call names, by id: product names, order numbers, discount codes. */
  names?: Record<string, string>;
  /** The currency of the order a call names, for refund amounts. */
  orderCurrency?: string;
  /** The discount code an update changes, as it is now. */
  discount?: DiscountTerms;
  /** A signed link to the unpublished draft, for publishing. */
  previewUrl?: string;
}

/** Arguments never shown: bookkeeping, the page tree itself, and card security codes. */
export const HIDDEN_FIELDS = new Set(["idempotencyKey", "tree", "cvc", "expiry"]);
export const LANGUAGE_FIELDS = new Set(["languages", "defaultLanguage", "language", "preferredLanguage"]);
export const CURRENCY_FIELDS = new Set(["currencies", "defaultCurrency", "currency", "preferredCurrency"]);
const COUNTRY_FIELDS = new Set(["countries", "country", "destination"]);
const MONEY_FIELDS = new Set([
  "price",
  "amount",
  "unitCost",
  "minimumSubtotal",
  "threshold",
  "upTo",
  "spendLimitPerRecipient",
  "targetUnitCost",
  "denominations",
]);
const LIST_LIMIT = 8;
const TEXT_LIMIT = 300;

const table = FIELD_LABELS;

function fieldLabel(locale: string, key: string): string {
  const label = table[locale]?.fields[key] ?? table.en?.fields[key];
  if (label) return label;
  const words = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function optionLabel(locale: string, key: string, value: string): string | null {
  return table[locale]?.values[`${key}.${value}`] ?? table.en?.values[`${key}.${value}`] ?? null;
}

function displayName(locale: string, type: "language" | "currency", code: string): string {
  try {
    return new Intl.DisplayNames([locale], { type }).of(type === "currency" ? code.toUpperCase() : code) ?? code;
  } catch {
    return code;
  }
}

function list(locale: string, items: string[]): string {
  const shown = items.length > LIST_LIMIT ? [...items.slice(0, LIST_LIMIT), `+${items.length - LIST_LIMIT}`] : items;
  return new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(shown);
}

export function formatAmount(locale: string, minor: number, currency: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: currency.toUpperCase(), currencyDisplay: "narrowSymbol" }).format(
    minor / minorFactor(currency),
  );
}

function formatDay(locale: string, value: string): string {
  // The calendar day as written, whatever the server's time zone.
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(date);
}

/** One argument's value as the person reads it. */
function formatValue(key: string, value: unknown, ctx: DescribeContext, currency: string): string {
  const { locale, t } = ctx;
  if (value === null || value === undefined || value === "") return t("none");
  if (typeof value === "boolean") return value ? t("yes") : t("no");
  if (Array.isArray(value)) {
    if (value.length === 0) return t("none");
    if (value.every((entry) => entry === null || typeof entry !== "object")) {
      return list(
        locale,
        value.map((entry) => formatValue(key, entry, ctx, currency)),
      );
    }
    return value
      .slice(0, LIST_LIMIT)
      .map((entry) => formatValue(key, entry, ctx, currency))
      .concat(value.length > LIST_LIMIT ? [`+${value.length - LIST_LIMIT}`] : [])
      .join("\n");
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([inner]) => !HIDDEN_FIELDS.has(inner))
      .map(([inner, entry]) => `${fieldLabel(locale, inner)}: ${formatValue(inner, entry, ctx, currency)}`)
      .join(" · ");
  }
  if (typeof value === "number") {
    if (MONEY_FIELDS.has(key)) return formatAmount(locale, value, currency);
    return new Intl.NumberFormat(locale).format(value);
  }
  const text = String(value);
  if (ctx.names?.[text]) return ctx.names[text];
  if (LANGUAGE_FIELDS.has(key)) return displayName(locale, "language", text);
  if (CURRENCY_FIELDS.has(key)) return displayName(locale, "currency", text);
  if (COUNTRY_FIELDS.has(key) && /^[A-Z]{2}$/.test(text)) return localCountryName(text, locale);
  if (/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/.test(text)) return formatDay(locale, text);
  if (key === "cardNumber") return t("cardEnding", { last4: text.replace(/\D/g, "").slice(-4) });
  const option = optionLabel(locale, key, text);
  if (option) return option;
  return text.length > TEXT_LIMIT ? `${text.slice(0, TEXT_LIMIT)}…` : text;
}

function details(args: Record<string, unknown>, ctx: DescribeContext, currency: string, shown: string[] = []): CallDescription["details"] {
  return Object.entries(args)
    .filter(([key, value]) => !HIDDEN_FIELDS.has(key) && !shown.includes(key) && value !== undefined)
    .map(([key, value]) => ({ label: fieldLabel(ctx.locale, key), value: formatValue(key, value, ctx, currency) }));
}

/** "15% off any order with code WELCOME15, until the end of 30 November 2026" and its limits. */
export function discountSentences(terms: DiscountTerms, ctx: DescribeContext): string[] {
  const { t, locale } = ctx;
  const amount =
    terms.kind === "percentage"
      ? new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 2 }).format(terms.value / 100)
      : formatAmount(locale, terms.value, terms.currency);
  let sentence =
    terms.minimumSubtotal > 0
      ? t("discountMinimum", { amount, code: terms.code, minimum: formatAmount(locale, terms.minimumSubtotal, terms.currency) })
      : t("discount", { amount, code: terms.code });
  if (terms.expiresAt) sentence = t("discountUntil", { terms: sentence, date: formatDay(locale, terms.expiresAt) });
  const lines = [sentence];
  if (terms.usageLimit) lines.push(t("usageLimit", { count: terms.usageLimit }));
  if (!terms.active) lines.push(t("discountOff"));
  return lines;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

/** What the confirmation card says about one call. */
export function describeCall(operationId: string, args: Record<string, unknown>, ctx: DescribeContext): CallDescription {
  const { t, locale, store } = ctx;
  const name = (id: unknown) => (typeof id === "string" ? ctx.names?.[id] ?? id : "");
  const currency = typeof args.currency === "string" ? args.currency : store.defaultCurrency;
  const result = (summary: string[], shown: string[], money = currency, links: CallDescription["links"] = []): CallDescription => ({
    summary,
    details: details(args, ctx, money, shown),
    links,
  });

  switch (operationId) {
    case "createDiscount":
      return result(
        discountSentences(
          {
            code: String(args.code ?? "").toUpperCase(),
            kind: args.kind === "fixed" ? "fixed" : "percentage",
            value: Number(args.value ?? 0),
            currency: store.defaultCurrency,
            minimumSubtotal: Number(args.minimumSubtotal ?? 0),
            expiresAt: typeof args.expiresAt === "string" ? args.expiresAt : null,
            usageLimit: typeof args.usageLimit === "number" ? args.usageLimit : null,
            active: args.active !== false,
          },
          ctx,
        ),
        ["code", "kind", "value", "minimumSubtotal", "expiresAt", "usageLimit", "active"],
      );
    case "updateDiscount": {
      const current = ctx.discount;
      if (!current) return result([t("discountChange", { code: name(args.discountId) })], ["discountId"]);
      const next: DiscountTerms = {
        ...current,
        ...(args.kind === "percentage" || args.kind === "fixed" ? { kind: args.kind } : {}),
        ...(typeof args.value === "number" ? { value: args.value } : {}),
        ...(typeof args.minimumSubtotal === "number" ? { minimumSubtotal: args.minimumSubtotal } : {}),
        ...(args.expiresAt !== undefined ? { expiresAt: typeof args.expiresAt === "string" ? args.expiresAt : null } : {}),
        ...(args.usageLimit !== undefined ? { usageLimit: typeof args.usageLimit === "number" ? args.usageLimit : null } : {}),
        ...(typeof args.active === "boolean" ? { active: args.active } : {}),
      };
      const summary = [t("discountChange", { code: current.code }), ...discountSentences(next, ctx)];
      if (args.expiresAt === null && current.expiresAt) summary.push(t("discountNoExpiry"));
      if (args.usageLimit === null && current.usageLimit) summary.push(t("discountNoLimit"));
      if (args.active === true && !current.active) summary.push(t("discountOn"));
      return result(summary, ["discountId", "kind", "value", "minimumSubtotal", "expiresAt", "usageLimit", "active"]);
    }
    case "updateLanguages": {
      const next = strings(args.languages);
      const languageNames = (codes: string[]) => list(locale, codes.map((code) => displayName(locale, "language", code)));
      const added = next.filter((code) => !store.languages.includes(code));
      const removed = store.languages.filter((code) => !next.includes(code));
      const summary: string[] = [];
      if (added.length) summary.push(t("addLanguages", { languages: languageNames(added) }));
      if (removed.length) summary.push(t("removeLanguages", { languages: languageNames(removed) }));
      if (typeof args.defaultLanguage === "string" && args.defaultLanguage !== store.defaultLanguage) {
        summary.push(t("defaultLanguage", { language: languageNames([args.defaultLanguage]) }));
      }
      if (summary.length === 0) summary.push(t("keepLanguages", { languages: languageNames(next) }));
      return result(summary, ["languages", "defaultLanguage"]);
    }
    case "updateCurrencies": {
      const next = strings(args.currencies).map((code) => code.toUpperCase());
      const currencyNames = (codes: string[]) => list(locale, codes.map((code) => displayName(locale, "currency", code)));
      const added = next.filter((code) => !store.currencies.includes(code));
      const removed = store.currencies.filter((code) => !next.includes(code));
      const summary: string[] = [];
      if (added.length) summary.push(t("addCurrencies", { currencies: currencyNames(added) }));
      if (removed.length) summary.push(t("removeCurrencies", { currencies: currencyNames(removed) }));
      if (typeof args.defaultCurrency === "string" && args.defaultCurrency.toUpperCase() !== store.defaultCurrency) {
        summary.push(t("defaultCurrency", { currency: currencyNames([args.defaultCurrency.toUpperCase()]) }));
      }
      if (summary.length === 0) summary.push(t("keepCurrencies", { currencies: currencyNames(next) }));
      return result(summary, ["currencies", "defaultCurrency"]);
    }
    case "publishStorefront": {
      const links: CallDescription["links"] = [];
      if (ctx.previewUrl) links.push({ label: t("previewDraft"), href: ctx.previewUrl, external: true });
      links.push({ label: t("compareDraft"), href: `/app/stores/${store.id}/storefront#compare` });
      return result([args.tree ? t("publishPage") : t("publishDraft")], ["tree"], currency, links);
    }
    case "updateProductStatus":
      return result(
        [t("productStatus", { product: name(args.productId), status: formatValue("status", args.status, ctx, currency) })],
        ["productId", "status"],
      );
    case "updateStoreStatus":
      return result([args.status === "archived" ? t("archiveStore") : t("activateStore")], ["status"]);
    case "refundOrder": {
      const money = ctx.orderCurrency ?? currency;
      return result(
        [t("refund", { amount: formatAmount(locale, Number(args.amount ?? 0), money), order: name(args.orderId) })],
        ["orderId", "amount"],
        money,
      );
    }
    case "issueGiftCard": {
      const amount = formatAmount(locale, Number(args.amount ?? 0), currency);
      const recipient = typeof args.recipientEmail === "string" ? args.recipientEmail : "";
      return result(
        [recipient ? t("giftCardFor", { amount, recipient }) : t("giftCard", { amount })],
        ["amount", "currency", "recipientEmail"],
      );
    }
    case "inviteTeamMember":
      return result(
        [t("invite", { email: String(args.email ?? ""), role: formatValue("role", args.role, ctx, currency) })],
        ["email", "role"],
      );
  }

  // Deletions name what goes.
  const idKey = Object.keys(args).find((key) => key.endsWith("Id") && typeof args[key] === "string" && ctx.names?.[args[key] as string]);
  if (idKey && operationId.startsWith("delete")) return result([t("delete", { name: name(args[idKey]) })], [idKey]);
  return result([], []);
}
