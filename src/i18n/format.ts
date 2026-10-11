import type { createFormatter } from "next-intl";
import { minorFactor } from "@/lib/util";

/** next-intl's formatter, as returned by `useFormatter()` or `getFormatter()`. */
type Formatter = ReturnType<typeof createFormatter>;

/** An integer minor-unit amount in the formatter's locale, e.g. (2499, "EUR") -> "€24.99" or "24,99 €". */
export function formatMinorUnits(format: Formatter, minor: number, currency: string): string {
  return format.number(minor / minorFactor(currency), {
    style: "currency",
    currency: currency.toUpperCase(),
    currencyDisplay: "narrowSymbol",
  });
}

const MONTH = 30 * 24 * 60 * 60 * 1000;

/** "5 minutes ago" for the last month, the date after that. */
export function formatAgo(format: Formatter, iso: string, now: Date): string {
  const date = new Date(iso);
  return now.getTime() - date.getTime() < MONTH ? format.relativeTime(date, now) : format.dateTime(date, "date");
}
