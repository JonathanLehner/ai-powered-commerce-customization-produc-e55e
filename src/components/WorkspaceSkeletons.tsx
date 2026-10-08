import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The shapes a workspace page settles into, drawn while its server components
 * are still reading. Every `loading.tsx` under the workspace is built from
 * these, so a slow read looks like the page arriving rather than the page
 * disappearing.
 */
export function PageHeaderSkeleton({ action = true }: { action?: boolean }) {
  return (
    <div className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="w-full space-y-2">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      {action ? <Skeleton className="h-8 w-40 shrink-0" /> : null}
    </div>
  );
}

export function StatCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <Card key={index} size="sm">
          <CardContent className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-3 w-28" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** A card section with a heading and a few lines of body. */
export function CardSkeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-full max-w-md" />
      </CardHeader>
      <CardContent className="space-y-2.5">
        {Array.from({ length: lines }, (_, index) => (
          <Skeleton key={index} className="h-4 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Card className="py-0">
      <div className="divide-y divide-border">
        <div className="flex gap-4 bg-muted px-4 py-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="ml-auto h-3 w-16" />
        </div>
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-center gap-4 px-4 py-3.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="ml-auto h-4 w-20" />
          </div>
        ))}
      </div>
    </Card>
  );
}

/** A grid of product-style cards, each a square image over two lines. */
export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }, (_, index) => (
        <li key={index}>
          <Card className="gap-0 py-0">
            <Skeleton className="aspect-square w-full rounded-none" />
            <CardContent className="space-y-2 py-4">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}

/** The toolbar a filtered list sits under. */
export function ToolbarSkeleton() {
  return (
    <Card size="sm">
      <CardContent className="flex flex-wrap items-end gap-3">
        <Skeleton className="h-8 min-w-[12rem] flex-1" />
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-8 w-20" />
      </CardContent>
    </Card>
  );
}
