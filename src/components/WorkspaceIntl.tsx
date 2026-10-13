import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { Document } from "@/components/Document";
import { workspaceLocale } from "@/i18n/user-locale";
import { pickMessages, workspaceNamespaces, type WorkspaceSection } from "@/i18n/workspace-messages";

/**
 * The document for the signed-in surfaces and the sign-in screens, in the
 * user's own language: their saved choice, then the browser's, then English.
 * Resolved here from the session and the request, so these routes always
 * render per visitor. Only the messages the shell's client components read are
 * sent to the browser, with those of `section` when the whole surface is one;
 * otherwise each section adds its own with `ClientMessages`.
 */
export async function WorkspaceDocument({
  section,
  children,
}: {
  section?: WorkspaceSection;
  children: React.ReactNode;
}) {
  const locale = await workspaceLocale();
  const messages = pickMessages(await getMessages({ locale }), workspaceNamespaces(section));
  return (
    <Document lang={locale}>
      <NextIntlClientProvider locale={locale} messages={messages}>
        {children}
      </NextIntlClientProvider>
    </Document>
  );
}
