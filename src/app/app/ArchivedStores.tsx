"use client";

import { ChevronDownIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

/**
 * Archived stores folded away behind their own count.
 *
 * An agency that has run the platform for a while has far more archived stores
 * than live ones, and they are reporting records rather than something to work
 * on, so they stay out of the way until somebody asks for them.
 */
export function ArchivedStores({ count, children }: { count: number; children: ReactNode }) {
  return (
    <Collapsible className="mt-9">
      <h2>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="-ml-2.5 [&[data-state=open]>svg]:rotate-180">
            <ChevronDownIcon aria-hidden className="text-muted-foreground transition-transform" />
            <span className="font-heading text-base font-medium">Archived stores</span>
            <span className="text-muted-foreground tabular-nums">({count})</span>
          </Button>
        </CollapsibleTrigger>
      </h2>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
}
