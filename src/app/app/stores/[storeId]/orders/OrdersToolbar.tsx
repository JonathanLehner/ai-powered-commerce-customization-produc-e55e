"use client";

import { DownloadIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { OrderListFilters } from "@/lib/order-list";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/types";

/** The value the status dropdown carries for "no status filter". */
const ANY = "all";

/**
 * One row: the search box, the status dropdown, and the download of exactly
 * what the filters describe. The filters are submitted as a GET form, so the
 * table, the pager and the spreadsheet all read them back off the URL.
 *
 * The labels are there for a screen reader but not drawn — the placeholder and
 * the selected status say what each control is, and a row of stacked labels
 * above a toolbar costs a line of the table.
 */
export function OrdersToolbar({
  base,
  filters,
  searchPlaceholder,
  exportHref,
  showClear,
}: {
  base: string;
  filters: OrderListFilters;
  searchPlaceholder: string;
  /** Null for platform access, which may not download the shopper records. */
  exportHref: string | null;
  showClear: boolean;
}) {
  const [status, setStatus] = useState<string>(filters.status ?? ANY);

  return (
    <form method="get" action={base} className="flex flex-wrap items-center gap-2">
      {filters.campaign ? <input type="hidden" name="campaign" value={filters.campaign} /> : null}
      {filters.view ? <input type="hidden" name="view" value={filters.view} /> : null}

      <Label htmlFor="q" className="sr-only">
        Search
      </Label>
      <div className="relative min-w-[12rem] flex-1">
        <SearchIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id="q"
          name="q"
          defaultValue={filters.q}
          placeholder={searchPlaceholder}
          className="pl-8"
        />
      </div>

      <Label htmlFor="status" className="sr-only">
        Status
      </Label>
      <Select name="status" value={status} onValueChange={setStatus}>
        <SelectTrigger id="status" className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>All</SelectItem>
          {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map((key) => (
            <SelectItem key={key} value={key}>
              {ORDER_STATUS_LABELS[key]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button type="submit" variant="outline">
        Filter
      </Button>
      {showClear ? (
        <Button asChild variant="ghost">
          <Link href={base} prefetch={false}>
            Clear
          </Link>
        </Button>
      ) : null}

      <span className="sm:ml-auto">
        {exportHref ? (
          // A download, not a navigation: the browser saves the CSV the route
          // handler returns and leaves the page where it is.
          <Button asChild variant="outline">
            <a href={exportHref} download>
              <DownloadIcon />
              Download CSV
            </a>
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled
            title="Only the store team who work the orders can download the shopper records."
          >
            <DownloadIcon />
            Download CSV
          </Button>
        )}
      </span>
    </form>
  );
}
