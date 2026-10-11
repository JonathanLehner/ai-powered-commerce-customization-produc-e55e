"use client";

import { SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * The value each dropdown carries for "no filter". Radix refuses an empty
 * option value, so the sentinel is posted as a blank through a hidden field and
 * the page keeps reading the same query keys it always has.
 */
const ANY = "all";

function Dropdown({
  id,
  label,
  anyLabel,
  options,
  value,
}: {
  id: string;
  label: string;
  anyLabel: string;
  options: { value: string; label: string }[];
  value: string;
}) {
  const [current, setCurrent] = useState(value || ANY);

  return (
    <div>
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <input type="hidden" name={id} value={current === ANY ? "" : current} />
      <Select value={current} onValueChange={setCurrent}>
        <SelectTrigger id={id} className="mt-1.5 w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>{anyLabel}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function SourcingFilters({
  q,
  category,
  supplier,
  region,
  suppliers,
  regions,
  compare,
  clearHref,
}: {
  q: string;
  category: string;
  supplier: string;
  region: string;
  suppliers: { id: string; name: string }[];
  regions: string[];
  /** Carried through the filter submit so a comparison survives a re-filter. */
  compare: string | undefined;
  clearHref: string;
}) {
  const t = useTranslations("sourcing.filters");
  const labels = useTranslations("labels");
  const regionLabel = (name: string) =>
    labels.has(`region.${name}` as "region.APAC") ? labels(`region.${name}` as "region.APAC") : name;
  return (
    <Card size="sm" asChild>
      <form method="get">
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="min-w-[12rem] flex-1">
            <Label htmlFor="q" className="text-xs">
              {t("search")}
            </Label>
            <div className="relative mt-1.5">
              <SearchIcon
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input id="q" name="q" defaultValue={q} placeholder={t("searchPlaceholder")} className="pl-8" />
            </div>
          </div>
          <Dropdown
            id="category"
            label={t("category")}
            anyLabel={t("all")}
            value={category}
            options={[
              { value: "apparel", label: t("apparel") },
              { value: "drinkware", label: t("drinkware") },
            ]}
          />
          <Dropdown
            id="supplier"
            label={t("supplier")}
            anyLabel={t("allApproved")}
            value={supplier}
            options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
          />
          <Dropdown
            id="region"
            label={t("fulfilsTo")}
            anyLabel={t("anywhere")}
            value={region}
            options={regions.map((r) => ({ value: r, label: regionLabel(r) }))}
          />
          {compare ? <input type="hidden" name="compare" value={compare} /> : null}
          <Button type="submit" variant="outline">
            {t("apply")}
          </Button>
          {q || category || supplier || region ? (
            <Button asChild variant="ghost">
              <Link href={clearHref} prefetch={false}>
                {t("clear")}
              </Link>
            </Button>
          ) : null}
        </CardContent>
      </form>
    </Card>
  );
}
