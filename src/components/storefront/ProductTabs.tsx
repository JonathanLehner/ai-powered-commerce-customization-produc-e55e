"use client";

import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * The product page's description tabs. Every panel is in the server's HTML
 * (inactive ones hidden, not left out), so the description and details are
 * there for search engines and for shoppers without JavaScript.
 */
export function ProductTabs({ panels }: { panels: { id: string; label: string; content: ReactNode }[] }) {
  if (panels.length === 0) return null;
  return (
    <Tabs defaultValue={panels[0].id} className="gap-6">
      <TabsList variant="line" className="w-full justify-start gap-4 border-b border-border">
        {panels.map((panel) => (
          <TabsTrigger key={panel.id} value={panel.id} className="flex-none px-1 text-sm font-semibold">
            {panel.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {panels.map((panel) => (
        <TabsContent key={panel.id} value={panel.id} forceMount className="data-[state=inactive]:hidden">
          {panel.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
