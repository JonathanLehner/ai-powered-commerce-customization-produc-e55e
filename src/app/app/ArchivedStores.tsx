"use client";

import { ChevronDownIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * The archived list, folded away behind a toggle that says how many there are.
 * An agency that has run for a while has more archived stores than live ones,
 * and the dashboard is read for the live ones.
 */
export function ArchivedStores({ count, children }: { count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const noun = count === 1 ? "archived store" : "archived stores";
  return (
    <div className="mt-4 space-y-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <ChevronDownIcon className={open ? "rotate-180 transition-transform" : "transition-transform"} />
        {open ? `Hide ${count} ${noun}` : `Show ${count} ${noun}`}
      </Button>
      {open ? children : null}
    </div>
  );
}
