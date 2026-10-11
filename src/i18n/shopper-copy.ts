import type messages from "../../messages/en.json";

/** The built-in shopper copy, as `messages/en.json` defines it under `storefront`. */
export type ShopperMessages = (typeof messages)["storefront"];

/**
 * next-intl's translator for one group of the shopper copy, as `getTranslations`,
 * `useTranslations` or `createTranslator` return it for `storefront.<group>`.
 * Shared modules take one of these rather than reaching for the request, so the
 * check scripts can hand them a translator of their own.
 */
export type ShopperTranslator<Group extends keyof ShopperMessages> = (
  key: keyof ShopperMessages[Group] & string,
  values?: Record<string, string | number>,
) => string;
