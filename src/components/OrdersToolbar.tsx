"use client";

import { SearchIcon } from "lucide-react";
import { useRef } from "react";
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

/** The value the status control carries when it is not narrowing anything. */
const ALL = "all";

/**
 * Search, status and the spreadsheet in one row above the queue.
 *
 * It stays an ordinary GET form, so the filters end up in the URL the table,
 * the pager and the download all read. Choosing a status submits straight away;
 * typing in the search box submits on Enter.
 */
export function OrdersToolbar({
  action,
  filters,
  placeholder,
  exportHref,
}: {
  action: string;
  filters: OrderListFilters;
  placeholder: string;
  /** Absent for a role that may not see shopper records. */
  exportHref: string | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} method="get" action={action} className="flex flex-wrap items-center gap-2">
      {filters.campaign ? <input type="hidden" name="campaign" value={filters.campaign} /> : null}
      {filters.view ? <input type="hidden" name="view" value={filters.view} /> : null}

      <div className="relative min-w-[12rem] flex-1">
        <Label htmlFor="q" className="sr-only">
          Search
        </Label>
        <SearchIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <Input id="q" name="q" defaultValue={filters.q} placeholder={placeholder} className="pl-8" />
      </div>

      <Label htmlFor="status" className="sr-only">
        Status
      </Label>
      <Select
        name="status"
        defaultValue={filters.status ?? ALL}
        onValueChange={() => formRef.current?.requestSubmit()}
      >
        <SelectTrigger id="status" className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All</SelectItem>
          {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map((key) => (
            <SelectItem key={key} value={key}>
              {ORDER_STATUS_LABELS[key]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {exportHref ? (
        // A download, not a navigation: the browser saves the CSV the route
        // handler returns and leaves the page where it is.
        <Button asChild variant="outline">
          <a href={exportHref} download>
            Download CSV
          </a>
        </Button>
      ) : (
        <Button
          variant="outline"
          disabled
          title="Only the store team who work the orders can download the shopper records."
        >
          Download CSV
        </Button>
      )}
    </form>
  );
}
