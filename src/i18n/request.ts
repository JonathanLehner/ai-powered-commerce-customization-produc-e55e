import { getRequestConfig } from "next-intl/server";
import { isLocale } from "./locales";
import { workspaceLocale } from "./user-locale";

/**
 * Per-request next-intl configuration.
 *
 * The public site names its locale in the address and calls `setRequestLocale`
 * (or passes the locale explicitly), so nothing here reads the request and the
 * pages stay prerendered. The workspace has no locale in its addresses, so it
 * falls through to the user's preference, which `WorkspaceDocument` resolves
 * the same way for the document itself.
 */
export default getRequestConfig(async ({ locale, requestLocale }) => {
  const requested = locale ?? (await requestLocale);
  const resolved = isLocale(requested) ? requested : await workspaceLocale();
  return {
    locale: resolved,
    messages: (await import(`../../messages/${resolved}.json`)).default,
    // The server's clock, so dates read the same in the HTML and after hydration.
    timeZone: "UTC",
    formats: {
      dateTime: {
        date: { year: "numeric", month: "short", day: "numeric" },
      },
    },
  };
});
