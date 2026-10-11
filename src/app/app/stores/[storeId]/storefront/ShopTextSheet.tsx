"use client";

import { SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "@/components/ui/sonner";
import { saveShopText } from "@/app/actions/translations";
import { Badge } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SHOP_TEXT_GROUPS, type ShopTextPage } from "@/lib/shop-text";

export interface ShopTextData {
  /** Every editable string, in page order: `{ page: "checkout", key: "checkout.pay" }`. */
  entries: { page: ShopTextPage; key: string }[];
  /** The built-in text per language and key. */
  builtIn: Record<string, Record<string, string>>;
  /** The store's overrides per language and key. */
  overrides: Record<string, Record<string, string>>;
}

/**
 * The built-in text shoppers read, grouped by the page it appears on. Each row
 * shows the built-in wording as its placeholder; a store's own wording is
 * saved per language and "Reset to default" removes it.
 */
export function ShopTextSheet({
  storeId,
  locale,
  defaultLocale,
  languageLabel,
  data,
}: {
  storeId: string;
  locale: string;
  defaultLocale: string;
  languageLabel: string;
  data: ShopTextData;
}) {
  const t = useTranslations("editor.shopText");
  const [overrides, setOverrides] = useState(data.overrides);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState<ShopTextPage>("product");

  const builtIn = data.builtIn[locale];
  // In another language the default language's wording is shown too, as context.
  const source = locale === defaultLocale ? undefined : data.builtIn[defaultLocale];
  const saved = overrides[locale];
  const needle = query.trim().toLocaleLowerCase();
  const matches = useMemo(() => {
    const out = new Map<ShopTextPage, string[]>();
    for (const entry of data.entries) {
      const haystack = `${builtIn?.[entry.key] ?? ""} ${saved?.[entry.key] ?? ""} ${entry.key}`.toLocaleLowerCase();
      if (needle && !haystack.includes(needle)) continue;
      out.set(entry.page, [...(out.get(entry.page) ?? []), entry.key]);
    }
    return out;
  }, [data.entries, builtIn, saved, needle]);

  function stored(key: string, value: string | null) {
    setOverrides((current) => {
      const forLocale = { ...(current[locale] ?? {}) };
      if (value === null) delete forLocale[key];
      else forLocale[key] = value;
      return { ...current, [locale]: forLocale };
    });
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button type="button" variant="outline">
          {t("open")}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 data-[side=right]:sm:max-w-3xl">
        <SheetHeader className="border-b border-border">
          <SheetTitle>{t("title")}</SheetTitle>
          <SheetDescription>{t("description", { language: languageLabel })}</SheetDescription>
          <div className="relative mt-3">
            <SearchIcon
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("search")}
              aria-label={t("search")}
              className="pl-8"
            />
          </div>
        </SheetHeader>

        <Tabs
          value={page}
          onValueChange={(next) => setPage(next as ShopTextPage)}
          className="min-h-0 flex-1 gap-0"
        >
          <div className="overflow-x-auto border-b border-border px-4 py-2">
            <TabsList>
              {SHOP_TEXT_GROUPS.map((group) => (
                <TabsTrigger key={group.id} value={group.id} className="px-2.5">
                  {t(`pages.${group.id}`)}
                  {needle ? (
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {matches.get(group.id)?.length ?? 0}
                    </span>
                  ) : null}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {SHOP_TEXT_GROUPS.map((group) => {
            const keys = matches.get(group.id) ?? [];
            return (
              <TabsContent key={group.id} value={group.id} className="min-h-0 overflow-y-auto">
                {keys.length === 0 ? (
                  <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t("noMatch")}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[42%] pl-4">{t("builtIn")}</TableHead>
                        <TableHead className="pr-4">{t("yours")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {keys.map((key) => (
                        <ShopTextRow
                          key={`${locale}:${key}`}
                          storeId={storeId}
                          locale={locale}
                          entryKey={key}
                          builtIn={builtIn?.[key] ?? ""}
                          source={source?.[key]}
                          override={saved?.[key] ?? null}
                          onStored={(value) => stored(key, value)}
                        />
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function ShopTextRow({
  storeId,
  locale,
  entryKey,
  builtIn,
  source,
  override,
  onStored,
}: {
  storeId: string;
  locale: string;
  entryKey: string;
  builtIn: string;
  source?: string;
  override: string | null;
  onStored: (value: string | null) => void;
}) {
  const t = useTranslations("editor.shopText");
  const [value, setValue] = useState(override ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = value.trim() !== (override ?? "");
  const id = `shop-text-${entryKey.replace(".", "-")}`;

  async function save(next: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await saveShopText({ storeId, locale, key: entryKey, value: next });
      if (result.status === "error") {
        setError(result.message ?? t("failed"));
        return;
      }
      onStored(result.value ?? null);
      setValue(result.value ?? "");
      toast.success(result.message);
    } catch {
      setError(t("failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <TableRow className="align-top hover:bg-transparent">
      <TableCell className="pl-4 whitespace-normal">
        <label htmlFor={id} className="block text-sm text-foreground">
          {builtIn}
        </label>
        {source && source !== builtIn ? <p className="mt-0.5 text-xs text-muted-foreground">{source}</p> : null}
        {override !== null ? (
          <Badge tone="brand" className="mt-1.5">
            {t("edited")}
          </Badge>
        ) : null}
      </TableCell>
      <TableCell className="pr-4 whitespace-normal">
        <Input
          id={id}
          value={value}
          placeholder={builtIn}
          disabled={busy}
          aria-invalid={error ? true : undefined}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && dirty) {
              e.preventDefault();
              save(value);
            }
          }}
        />
        {error ? <p className="mt-1.5 text-xs text-destructive">{error}</p> : null}
        {dirty || override !== null ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {dirty ? (
              <Button type="button" size="sm" disabled={busy} onClick={() => save(value)}>
                {busy ? t("saving") : t("save")}
              </Button>
            ) : null}
            {override !== null ? (
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => save("")}>
                {t("reset")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
