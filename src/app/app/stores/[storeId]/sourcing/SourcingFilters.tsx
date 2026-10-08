"use client";

import { SearchIcon } from "lucide-react";
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
  return (
    <Card size="sm" asChild>
      <form method="get">
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="min-w-[12rem] flex-1">
            <Label htmlFor="q" className="text-xs">
              Search
            </Label>
            <div className="relative mt-1.5">
              <SearchIcon
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input id="q" name="q" defaultValue={q} placeholder="Tee, hoodie, mug…" className="pl-8" />
            </div>
          </div>
          <Dropdown
            id="category"
            label="Category"
            anyLabel="All"
            value={category}
            options={[
              { value: "apparel", label: "Apparel" },
              { value: "drinkware", label: "Drinkware" },
            ]}
          />
          <Dropdown
            id="supplier"
            label="Supplier"
            anyLabel="All approved"
            value={supplier}
            options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
          />
          <Dropdown
            id="region"
            label="Fulfils to"
            anyLabel="Anywhere"
            value={region}
            options={regions.map((r) => ({ value: r, label: r }))}
          />
          {compare ? <input type="hidden" name="compare" value={compare} /> : null}
          <Button type="submit" variant="outline">
            Apply filters
          </Button>
          {q || category || supplier || region ? (
            <Button asChild variant="ghost">
              <Link href={clearHref} prefetch={false}>
                Clear
              </Link>
            </Button>
          ) : null}
        </CardContent>
      </form>
    </Card>
  );
}
