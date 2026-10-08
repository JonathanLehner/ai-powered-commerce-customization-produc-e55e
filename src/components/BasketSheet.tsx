"use client";

import Link from "next/link";
import { useState } from "react";
import { removeCartItem } from "@/app/actions/shop";
import { Button, buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { StorefrontCopy } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export interface BasketSheetLine {
  id: string;
  productName: string;
  variantName: string;
  quantity: number;
  /** Already formatted in the store's language and display currency. */
  amount: string;
  previewUrl: string | null;
  text: string | null;
}

/**
 * The header basket. The drawer is the quick look — what is in the basket, what
 * it comes to and the two ways on — and `/s/[slug]/cart` is still the full page
 * where quantities are edited and a discount code is entered. Both read the
 * same cart and post to the same server actions.
 */
export function BasketSheet({
  storeId,
  slug,
  triggerLabel,
  lines,
  subtotal,
  t,
}: {
  storeId: string;
  slug: string;
  /** The same label the header has always shown, count and all. */
  triggerLabel: string;
  lines: BasketSheetLine[];
  subtotal: string;
  t: StorefrontCopy["basket"];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="lg">
          {triggerLabel}
        </Button>
      </SheetTrigger>
      <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t.title}</SheetTitle>
          <SheetDescription>{t.drawerIntro}</SheetDescription>
        </SheetHeader>
        <Separator />

        {lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="font-heading text-base text-foreground">{t.emptyTitle}</p>
            <p className="text-sm text-muted-foreground">{t.emptyBody}</p>
            <Link
              href={`/s/${slug}/products`}
              onClick={() => setOpen(false)}
              className={buttonVariants({ size: "lg" })}
            >
              {t.browseShop}
            </Link>
          </div>
        ) : (
          <ul className="flex-1 divide-y divide-border overflow-y-auto px-4">
            {lines.map((line) => (
              <li key={line.id} className="flex gap-3 py-4">
                {line.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={line.previewUrl}
                    alt=""
                    width={64}
                    height={80}
                    loading="lazy"
                    className="h-20 w-16 shrink-0 rounded-md border border-border bg-muted object-cover"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{line.productName}</p>
                  <p className="text-xs text-muted-foreground">
                    {line.variantName} × {line.quantity}
                  </p>
                  {line.text ? (
                    <p className="mt-0.5 truncate text-xs text-inksoft">
                      {t.personalisation} {line.text}
                    </p>
                  ) : null}
                  <form action={removeCartItem} className="mt-1">
                    <input type="hidden" name="storeId" value={storeId} />
                    <input type="hidden" name="itemId" value={line.id} />
                    <Button type="submit" variant="ghost" size="xs" className="text-destructive">
                      {t.remove}
                    </Button>
                  </form>
                </div>
                <p className="shrink-0 text-sm font-medium tabular-nums text-foreground">
                  {line.amount}
                </p>
              </li>
            ))}
          </ul>
        )}

        {lines.length > 0 ? (
          <SheetFooter className="border-t border-border">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">{t.subtotal}</span>
              <span className="font-medium tabular-nums text-foreground">{subtotal}</span>
            </div>
            <Link
              href={`/s/${slug}/checkout`}
              onClick={() => setOpen(false)}
              className={cn(buttonVariants({ size: "lg" }), "w-full")}
            >
              {t.checkout}
            </Link>
            <Link
              href={`/s/${slug}/cart`}
              onClick={() => setOpen(false)}
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full")}
            >
              {t.viewBasket}
            </Link>
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
