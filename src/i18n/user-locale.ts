import "server-only";
import { match } from "@formatjs/intl-localematcher";
import Negotiator from "negotiator";
import { headers } from "next/headers";
import { getSessionUser } from "@/lib/session";
import { DEFAULT_LOCALE, LOCALES, isLocale, type Locale } from "./locales";

/** The best supported match for an Accept-Language header, or English. */
export function negotiateLocale(acceptLanguage: string | null): Locale {
  const requested = new Negotiator({ headers: { "accept-language": acceptLanguage ?? "" } })
    .languages()
    .filter((tag) => tag !== "*");
  try {
    const matched = match(requested, LOCALES, DEFAULT_LOCALE);
    return isLocale(matched) ? matched : DEFAULT_LOCALE;
  } catch {
    // A malformed tag in the header.
    return DEFAULT_LOCALE;
  }
}

/**
 * The language of the sign-in screens and the workspace: the signed-in user's
 * own choice, then the browser's languages, then English.
 */
export async function workspaceLocale(): Promise<Locale> {
  const user = await getSessionUser();
  if (isLocale(user?.uiLanguage)) return user.uiLanguage;
  return negotiateLocale((await headers()).get("accept-language"));
}
