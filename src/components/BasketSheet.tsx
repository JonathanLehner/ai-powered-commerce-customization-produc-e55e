"use client";

import Link from "next/link";
import { useState } from "react";
import { ShoppingBagIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { fmt, type StorefrontCopy } from "@/lib/i18n";
import { formatMoney } from "@/lib/util";

export interface BasketSheetLine {
  id: string;
  productName: string;
  variantName: string;
  quantity: number;
  /** Line total in the display currency, in minor units. */
  amount: number;
  previewUrl: string | null;
  text: string | null;
}

/**
 * The basket, one click from anywhere in the shop.
 *
 * The drawer is a convenience on top of `/cart`, never a replacement: the full
 * page is still linked from here and from the footer, and it is where quantities
 * are changed, a discount code is entered and the totals are broken down. The
 * drawer therefore shows what is in the basket and the subtotal, and hands over.
 */
export function BasketSheet({
  slug,
  lines,
  count,
  subtotal,
  currency,
  localeTag,
  t,
  basket,
  viewBasketLabel,
}: {
  slug: string;
  lines: BasketSheetLine[];
  count: number;
  subtotal: number;
  currency: string;
  localeTag: string;
  t: StorefrontCopy["chrome"];
  basket: StorefrontCopy["basket"];
  /** "View basket", shared with the product page's own link. */
  viewBasketLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const money = (minor: number) => formatMoney(minor, currency, localeTag);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-2 px-3 text-sm">
          <ShoppingBagIcon aria-hidden className="size-4" />
          {count > 0 ? fmt(t.basketWithCount, { count }) : t.basket}
        </Button>
      </SheetTrigger>
      <SheetContent closeLabel={t.basketClose} aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle>{basket.title}</SheetTitle>
        </SheetHeader>

        {lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <ShoppingBagIcon aria-hidden className="size-7 text-muted" />
            <p className="text-sm font-medium text-ink">{basket.emptyTitle}</p>
            <p className="text-sm text-muted">{basket.emptyBody}</p>
          </div>
        ) : (
          <ul className="flex-1 divide-y divide-line overflow-y-auto px-5">
            {lines.map((line) => (
              <li key={line.id} className="flex gap-3 py-4">
                {line.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={line.previewUrl}
                    alt={fmt(basket.previewAlt, { name: line.productName })}
                    width={56}
                    height={70}
                    loading="lazy"
                    className="h-[70px] w-14 shrink-0 rounded-md border border-line bg-canvas object-cover"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{line.productName}</p>
                  <p className="text-xs text-muted">
                    {line.variantName} × {line.quantity}
                  </p>
                  {line.text ? (
                    <p className="mt-0.5 truncate text-xs text-inksoft">“{line.text}”</p>
                  ) : null}
                </div>
                <p className="shrink-0 text-sm font-medium tabular-nums text-ink">{money(line.amount)}</p>
              </li>
            ))}
          </ul>
        )}

        {lines.length > 0 ? (
          <SheetFooter>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted">{basket.subtotal}</span>
              <span className="text-base font-semibold tabular-nums text-ink">{money(subtotal)}</span>
            </div>
            <Button asChild className="w-full">
              <Link href={`/s/${slug}/checkout`} onClick={() => setOpen(false)}>
                {basket.checkout}
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href={`/s/${slug}/cart`} onClick={() => setOpen(false)}>
                {viewBasketLabel}
              </Link>
            </Button>
          </SheetFooter>
        ) : (
          <SheetFooter>
            <Button asChild variant="outline" className="w-full">
              <Link href={`/s/${slug}/products`} onClick={() => setOpen(false)}>
                {basket.browseShop}
              </Link>
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
