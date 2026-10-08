"use client";

import dynamic from "next/dynamic";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { EditorCanvasProps } from "./EditorCanvas";

/** Craft.js is browser-only, so the canvas is loaded client-side. */
const EditorCanvas = dynamic(() => import("./EditorCanvas"), {
  ssr: false,
  loading: () => (
    <Card size="sm">
      <CardContent className="space-y-4 py-6">
        {/* The three columns the canvas settles into, so the page does not jump. */}
        <Skeleton className="h-10 w-full" />
        <div className="grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)_20rem]">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
        <p className="text-center text-sm text-muted-foreground">Loading the storefront editor…</p>
      </CardContent>
    </Card>
  ),
});

export function StorefrontEditor(props: EditorCanvasProps) {
  return <EditorCanvas {...props} />;
}
