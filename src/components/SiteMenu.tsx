"use client";

import { CheckIcon, MenuIcon, XIcon } from "lucide-react";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { LOCALES, LOCALE_NAMES } from "@/i18n/locales";
import { getPathname, usePathname } from "@/i18n/navigation";

/**
 * The public header's menu on small screens: the page links, and the language
 * list where the page has a translation to switch to. Every entry is a plain
 * link, so it works as a full page load of a prerendered document.
 */
export function SiteMenu({
  labels,
  links,
  languages,
}: {
  labels: { menu: string; close: string; language: string };
  links: { href: string; label: string }[];
  /** Off on the site-wide 404, which has no translated address and no locale provider. */
  languages: boolean;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={labels.menu} className="md:hidden">
          <MenuIcon aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" showCloseButton={false} aria-describedby={undefined} className="w-72 gap-0 overflow-y-auto">
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-4">
          <SheetTitle>{labels.menu}</SheetTitle>
          <SheetClose asChild>
            <Button variant="ghost" size="icon-sm" aria-label={labels.close}>
              <XIcon aria-hidden />
            </Button>
          </SheetClose>
        </div>
        <nav className="flex flex-col p-2">
          {links.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-inksoft hover:bg-canvas hover:text-ink"
            >
              {item.label}
            </a>
          ))}
        </nav>
        {languages ? <LanguageList label={labels.language} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function LanguageList({ label }: { label: string }) {
  const locale = useLocale();
  const pathname = usePathname();
  return (
    <div className="border-t border-line p-2">
      <h2 className="px-3 pt-2 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</h2>
      <ul>
        {LOCALES.map((option) => (
          <li key={option}>
            <a
              href={getPathname({ href: pathname, locale: option })}
              hrefLang={option}
              lang={option}
              aria-current={option === locale ? "true" : undefined}
              className="flex items-center rounded-lg px-3 py-2 text-sm text-inksoft hover:bg-canvas hover:text-ink aria-[current]:font-medium aria-[current]:text-ink"
            >
              <span className="flex-1">{LOCALE_NAMES[option]}</span>
              {option === locale ? <CheckIcon aria-hidden className="size-4" /> : null}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
