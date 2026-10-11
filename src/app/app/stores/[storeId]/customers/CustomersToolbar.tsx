"use client";

import { DownloadIcon, SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CustomerListFilters } from "@/lib/customers";

/** The value the country dropdown carries for "any country". */
const ANY = "all";

/**
 * Search, filters and the download of exactly what they describe, submitted as
 * a GET form so the table, the pager and the spreadsheet read the same URL.
 */
export function CustomersToolbar({
  base,
  filters,
  countries,
  exportHref,
  showClear,
}: {
  base: string;
  filters: CustomerListFilters;
  /** The countries the store's customers are in, already named in the reader's language. */
  countries: { code: string; name: string }[];
  exportHref: string;
  showClear: boolean;
}) {
  const [country, setCountry] = useState<string>(filters.country ?? ANY);
  const t = useTranslations("customers");

  return (
    <form method="get" action={base} className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <input type="hidden" name="sort" value={filters.sort} />
      <input type="hidden" name="dir" value={filters.dir} />

      <Label htmlFor="q" className="sr-only">
        {t("searchLabel")}
      </Label>
      <div className="relative min-w-[12rem] flex-1">
        <SearchIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input id="q" name="q" defaultValue={filters.q} placeholder={t("search")} className="pl-8" />
      </div>

      <Label htmlFor="country" className="sr-only">
        {t("countryLabel")}
      </Label>
      <Select name="country" value={country} onValueChange={setCountry}>
        <SelectTrigger id="country" className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>{t("allCountries")}</SelectItem>
          {countries.map((option) => (
            <SelectItem key={option.code} value={option.code}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Label className="flex items-center gap-2 text-sm font-normal">
        <Checkbox name="refunds" value="1" defaultChecked={filters.refunds} />
        {t("hasRefunds")}
      </Label>
      <Label className="flex items-center gap-2 text-sm font-normal">
        <Checkbox name="recent" value="1" defaultChecked={filters.recent} />
        {t("recent")}
      </Label>

      <Button type="submit" variant="outline">
        {t("filter")}
      </Button>
      {showClear ? (
        <Button asChild variant="ghost">
          <Link href={base} prefetch={false}>
            {t("clear")}
          </Link>
        </Button>
      ) : null}

      <span className="sm:ml-auto">
        <Button asChild variant="outline">
          <a href={exportHref} download>
            <DownloadIcon />
            {t("downloadCsv")}
          </a>
        </Button>
      </span>
    </form>
  );
}
