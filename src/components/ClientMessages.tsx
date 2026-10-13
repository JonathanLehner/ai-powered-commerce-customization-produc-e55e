import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { pickMessages, workspaceNamespaces, type WorkspaceSection } from "@/i18n/workspace-messages";

/**
 * Hands the client components of one workspace section the messages they read,
 * on top of the shell's (see `@/i18n/workspace-messages`). Rendered by the
 * section's layout, so it is rendered again whenever navigation enters the
 * section.
 */
export async function ClientMessages({ section, children }: { section: WorkspaceSection; children: React.ReactNode }) {
  const messages = pickMessages(await getMessages(), workspaceNamespaces(section));
  return <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>;
}
