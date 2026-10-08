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

/** The value the status dropdown carries for "no status filter". */
const ANY = "all";

/**
 * Search and status for one store's own catalog, submitted as a GET form so the
 * grid, the empty state and a shared link all read the same query string.
 */
export function CatalogToolbar({
  base,
  q,
  status,
}: {
  base: string;
  q: string;
  status: string;
}) {
  const [value, setValue] = useState<string>(status || ANY);

  return (
    <Card size="sm" asChild>
      <form method="get" action={base}>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="min-w-[12rem] flex-1">
            <Label htmlFor="q" className="text-xs">
              Search this catalog
            </Label>
            <div className="relative mt-1.5">
              <SearchIcon
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input id="q" name="q" defaultValue={q} placeholder="Name or tag" className="pl-8" />
            </div>
          </div>
          <div>
            <Label htmlFor="status" className="text-xs">
              Status
            </Label>
            <Select name="status" value={value} onValueChange={setValue}>
              <SelectTrigger id="status" className="mt-1.5 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>All</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="in_review">In review</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" variant="outline">
            Filter
          </Button>
          {q || status ? (
            <Button asChild variant="ghost">
              <Link href={base} prefetch={false}>
                Clear
              </Link>
            </Button>
          ) : null}
        </CardContent>
      </form>
    </Card>
  );
}
