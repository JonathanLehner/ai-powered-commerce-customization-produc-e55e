"use client";

import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";

/**
 * English for the shared form controls (pending labels, confirmations, copy
 * buttons) on any surface that does not set up next-intl itself. The public
 * site, the workspace, the storefronts and the gift portals wrap their pages
 * in their own provider, which takes precedence.
 */
export function BaseIntlProvider({
  messages,
  children,
}: {
  messages: AbstractIntlMessages;
  children: React.ReactNode;
}) {
  return (
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      {children}
    </NextIntlClientProvider>
  );
}
