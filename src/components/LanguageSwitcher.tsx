"use client";

import { CheckIcon, GlobeIcon } from "lucide-react";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LOCALES, LOCALE_NAMES } from "@/i18n/locales";
import { getPathname, usePathname } from "@/i18n/navigation";

/**
 * The public site's language menu. Each entry is a plain link to the same page
 * in that language, so it works as a full page load of a prerendered document.
 */
export function LanguageSwitcher({ label }: { label: string }) {
  const locale = useLocale();
  const pathname = usePathname();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`${label}: ${LOCALE_NAMES[locale]}`} className="-ml-2 sm:ml-0">
          <GlobeIcon aria-hidden />
          {LOCALE_NAMES[locale]}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {LOCALES.map((option) => (
          <DropdownMenuItem key={option} asChild>
            <a
              href={getPathname({ href: pathname, locale: option })}
              hrefLang={option}
              lang={option}
              aria-current={option === locale ? "true" : undefined}
            >
              <span className="flex-1">{LOCALE_NAMES[option]}</span>
              {option === locale ? <CheckIcon aria-hidden /> : null}
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
