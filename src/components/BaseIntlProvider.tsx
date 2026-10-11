"use client";

import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";

/**
 * English for the shared form controls (pending labels, confirmations, copy
 * buttons) on surfaces that do not set up next-intl themselves: the shopper
 * storefront and the gift portal, whose own copy comes from `lib/i18n`. The
 * public site and the workspace wrap their pages in their own provider, which
 * takes precedence.
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
