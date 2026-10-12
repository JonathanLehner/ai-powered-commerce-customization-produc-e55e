"use client";

import { SearchIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { instantSearch, type InstantResult } from "@/app/actions/search";
import { cn } from "@/lib/utils";

/**
 * The header's search box. Results appear as the shopper types (after a short
 * pause, so a fast typist sends one request rather than one per letter), and
 * Enter without a highlighted result opens the full search page. Without
 * JavaScript it is a plain form that opens the search page.
 */
export function StoreSearch({ storeId, base, className }: { storeId: string; base: string; className?: string }) {
  const t = useTranslations("storefront.search");
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<InstantResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const latest = useRef(0);
  const listId = useId();
  const inputId = useId();

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const request = ++latest.current;
    const timer = setTimeout(async () => {
      try {
        const found = await instantSearch(storeId, locale, q);
        // A slower answer to an earlier query must not replace a newer one.
        if (request === latest.current) {
          setResults(found);
          setActive(-1);
        }
      } catch {
        if (request === latest.current) setResults([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, storeId, locale]);

  const shown = query.trim().length >= 2 ? results : [];
  const expanded = open && shown.length > 0;

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && shown.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActive((current) => (current + 1) % shown.length);
    } else if (event.key === "ArrowUp" && shown.length > 0) {
      event.preventDefault();
      setActive((current) => (current <= 0 ? shown.length - 1 : current - 1));
    } else if (event.key === "Enter" && expanded && active >= 0) {
      event.preventDefault();
      window.location.assign(shown[active].href);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <form
      action={`${base}/search`}
      method="get"
      role="search"
      className={cn("relative", className)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <label htmlFor={inputId} className="sr-only">
        {t("label")}
      </label>
      <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        id={inputId}
        name="q"
        type="search"
        value={query}
        autoComplete="off"
        placeholder={t("placeholder")}
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="h-9 w-full rounded-lg border border-input bg-background pr-3 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
      <ul
        id={listId}
        role="listbox"
        aria-label={t("results")}
        hidden={!expanded}
        className="absolute top-full right-0 left-0 z-50 mt-1 max-h-96 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
      >
        {shown.map((result, index) => (
          <li key={`${result.kind}-${result.id}`} id={`${listId}-${index}`} role="option" aria-selected={index === active}>
            <a
              href={result.href}
              tabIndex={-1}
              className={cn(
                "flex items-center gap-3 rounded-md px-2 py-1.5 text-sm",
                index === active ? "bg-accent text-accent-foreground" : "hover:bg-muted",
              )}
            >
              {result.imageUrl ? (
                <Image src={result.imageUrl} alt="" width={72} height={72} sizes="36px" className="size-9 shrink-0 rounded object-cover" />
              ) : (
                <span aria-hidden className="size-9 shrink-0 rounded bg-muted" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-foreground">{result.title}</span>
                <span className="block text-xs text-muted-foreground">{t(`kinds.${result.kind}`)}</span>
              </span>
              {result.price ? <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{result.price}</span> : null}
            </a>
          </li>
        ))}
        <li role="presentation" className="border-t border-border pt-1">
          <a href={`${base}/search?q=${encodeURIComponent(query.trim())}`} className="block rounded-md px-2 py-1.5 text-sm text-primary hover:bg-muted">
            {t("seeAll", { query: query.trim() })}
          </a>
        </li>
      </ul>
    </form>
  );
}
