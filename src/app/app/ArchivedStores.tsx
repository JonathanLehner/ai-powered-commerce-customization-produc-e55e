"use client";

import { ChevronDownIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * Archived stores are kept for reporting, not worked on, so the dashboard folds
 * them away behind their own count and only opens them when asked.
 */
export function ArchivedStores({ count, children }: { count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="mt-9">
      <Button
        type="button"
        variant="ghost"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-controls="archived-stores"
        className="-ml-2 gap-1.5 text-base font-semibold"
      >
        <ChevronDownIcon
          aria-hidden
          className={open ? "transition-transform" : "-rotate-90 transition-transform"}
        />
        Archived stores
        <span className="text-muted-foreground tabular-nums">({count})</span>
      </Button>
      <div id="archived-stores" hidden={!open}>
        <p className="mt-1 text-sm text-muted-foreground">
          Archived stores keep their records for reporting and audit. Their storefronts are offline.
        </p>
        {children}
      </div>
    </section>
  );
}
