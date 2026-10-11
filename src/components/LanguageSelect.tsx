"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LOCALE_NAMES, isLocale, type Locale } from "@/i18n/locales";
import { SHOPPER_LOCALE_COOKIE, switchLocalePath } from "@/i18n/storefront-routing";

/**
 * The storefront header's language picker, beside the currency picker. It opens
 * the same page in the chosen language and remembers the choice, so the plain
 * address keeps serving it.
 */
export function LanguageSelect({
  root,
  locales,
  defaultLocale,
}: {
  /** `/s/<slug>` or `/g/<slug>`. */
  root: string;
  locales: Locale[];
  defaultLocale: Locale;
}) {
  const t = useTranslations("storefront.chrome");
  const current = useLocale();
  const pathname = usePathname();
  const [value, setValue] = useState<string>(current);
  const [pending, setPending] = useState(false);

  function apply(next: string) {
    if (!isLocale(next) || next === current) return;
    setValue(next);
    setPending(true);
    document.cookie = `${SHOPPER_LOCALE_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    window.location.assign(switchLocalePath(pathname, root, next, defaultLocale) + window.location.search);
  }

  return (
    <Select value={value} disabled={pending} onValueChange={apply}>
      <SelectTrigger className="h-9 min-w-[6.5rem]" aria-label={t("languageLabel")} aria-busy={pending}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {locales.map((locale) => (
          <SelectItem key={locale} value={locale} lang={locale}>
            {LOCALE_NAMES[locale]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
