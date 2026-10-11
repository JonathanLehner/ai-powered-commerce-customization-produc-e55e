"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * The collection page's sort order. Picking one loads the same address with
 * `?sort=`, keeping the tag filter, so the order is in the link a shopper
 * shares. Without JavaScript the page renders a native select and button in
 * `<noscript>` instead.
 */
export function SortSelect({
  id,
  value,
  options,
  hrefFor,
}: {
  id: string;
  value: string;
  options: { value: string; label: string }[];
  /** The address for each sort value, worked out on the server. */
  hrefFor: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Select
      value={value}
      disabled={pending}
      onValueChange={(next) => {
        const href = hrefFor[next];
        if (href && next !== value) startTransition(() => router.push(href, { scroll: false }));
      }}
    >
      <SelectTrigger id={id} className="h-9 min-w-48" aria-busy={pending}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
