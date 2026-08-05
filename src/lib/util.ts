/** Shared helpers. Amounts are always integers in a currency's minor unit. */

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function newId(prefix: string): string {
  let out = "";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return `${prefix}_${out}`;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const decimalsCache = new Map<string, number>();

export function currencyDecimals(currency: string): number {
  const key = currency.toUpperCase();
  const cached = decimalsCache.get(key);
  if (cached !== undefined) return cached;
  let digits = 2;
  try {
    digits =
      new Intl.NumberFormat("en", { style: "currency", currency: key }).resolvedOptions()
        .maximumFractionDigits ?? 2;
  } catch {
    digits = 2;
  }
  decimalsCache.set(key, digits);
  return digits;
}

export function minorFactor(currency: string): number {
  return 10 ** currencyDecimals(currency);
}

/** Formats an integer minor-unit amount, e.g. (2499, "EUR") -> "€24.99". */
export function formatMoney(minor: number, currency: string, locale = "en-US"): string {
  const value = minor / minorFactor(currency);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency.toUpperCase(),
      currencyDisplay: "narrowSymbol",
    }).format(value);
  } catch {
    return `${currency.toUpperCase()} ${value.toFixed(2)}`;
  }
}

/** Parses user input like "24.99" into minor units for the given currency. */
export function parseMoney(input: string, currency: string): number | null {
  const cleaned = input.replace(/[^0-9.,-]/g, "").replace(/,/g, ".");
  if (!cleaned || Number.isNaN(Number(cleaned))) return null;
  const value = Number(cleaned);
  if (value < 0) return null;
  return Math.round(value * minorFactor(currency));
}

export function toMajorString(minor: number, currency: string): string {
  return (minor / minorFactor(currency)).toFixed(currencyDecimals(currency));
}

export function formatPercent(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

export function formatDate(iso: string, locale = "en-US"): string {
  return new Date(iso).toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(iso: string, locale = "en-US"): string {
  return new Date(iso).toLocaleString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

export function orderCode(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const n = Array.from(bytes)
    .map((b) => b.toString(10).padStart(3, "0"))
    .join("")
    .slice(0, 8);
  return `ORD-${n}`;
}

export function classNames(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export const TRACKING_URLS: Record<"dhl" | "fedex" | "ups", (n: string) => string> = {
  dhl: (n) => `https://www.dhl.com/global-en/home/tracking/tracking-express.html?submit=1&tracking-id=${encodeURIComponent(n)}`,
  fedex: (n) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(n)}`,
  ups: (n) => `https://www.ups.com/track?loc=en_US&tracknum=${encodeURIComponent(n)}`,
};

export const CARRIER_LABELS: Record<"dhl" | "fedex" | "ups", string> = {
  dhl: "DHL Express",
  fedex: "FedEx",
  ups: "UPS",
};

export const CURRENCY_OPTIONS = [
  { code: "USD", label: "US Dollar" },
  { code: "EUR", label: "Euro" },
  { code: "GBP", label: "British Pound" },
  { code: "CAD", label: "Canadian Dollar" },
  { code: "AUD", label: "Australian Dollar" },
  { code: "JPY", label: "Japanese Yen" },
  { code: "SGD", label: "Singapore Dollar" },
  { code: "CHF", label: "Swiss Franc" },
  { code: "SEK", label: "Swedish Krona" },
  { code: "AED", label: "UAE Dirham" },
  { code: "BRL", label: "Brazilian Real" },
  { code: "INR", label: "Indian Rupee" },
  { code: "MXN", label: "Mexican Peso" },
  { code: "ZAR", label: "South African Rand" },
];

// The storefront languages live in src/lib/i18n.ts, next to the dictionaries and
// locale tags that make each one real: LANGUAGE_OPTIONS is derived from there so
// the dropdowns cannot drift from what is actually supported.

export const REGION_OPTIONS = [
  "North America",
  "European Union",
  "United Kingdom",
  "LATAM",
  "APAC",
  "Middle East",
  "Africa",
  "Oceania",
];

export const STRIPE_COUNTRIES = [
  { code: "US", label: "United States" },
  { code: "GB", label: "United Kingdom" },
  { code: "DE", label: "Germany" },
  { code: "FR", label: "France" },
  { code: "NL", label: "Netherlands" },
  { code: "ES", label: "Spain" },
  { code: "IT", label: "Italy" },
  { code: "CA", label: "Canada" },
  { code: "AU", label: "Australia" },
  { code: "JP", label: "Japan" },
  { code: "SG", label: "Singapore" },
  { code: "AE", label: "United Arab Emirates" },
  { code: "BR", label: "Brazil" },
  { code: "SE", label: "Sweden" },
];
