import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { Document } from "@/components/Document";
import { workspaceLocale } from "@/i18n/user-locale";

/**
 * The document for the signed-in surfaces and the sign-in screens, in the
 * user's own language: their saved choice, then the browser's, then English.
 * Resolved here from the session and the request, so these routes always
 * render per visitor. The public site's page copy is left out of what is sent
 * to the browser.
 */
export async function WorkspaceDocument({ children }: { children: React.ReactNode }) {
  const locale = await workspaceLocale();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { meta, site, home, howItWorks, pricing, contact, terms, privacy, ...messages } = await getMessages({ locale });
  return (
    <Document lang={locale}>
      <NextIntlClientProvider locale={locale} messages={messages}>
        {children}
      </NextIntlClientProvider>
    </Document>
  );
}
