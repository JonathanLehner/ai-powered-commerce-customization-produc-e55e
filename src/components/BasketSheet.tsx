"use client";

import { useFormatter, useTranslations } from "next-intl";
import { ShoppingBag } from "lucide-react";
import Link from "next/link";
import { createContext, use, useCallback, useMemo, useState } from "react";
import { removeCartItem } from "@/app/actions/shop";
import { formatMinorUnits } from "@/i18n/format";
import { LineThumbnail } from "@/components/LineThumbnail";
import { Button, buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { BasketSheetLine } from "@/lib/basket";
import { cn } from "@/lib/utils";

interface BasketContextValue {
  lines: BasketSheetLine[];
  subtotal: number;
  currency: string;
  base: string;
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Shows the basket an add has just saved, ahead of the next page render. */
  showSaved: (basket: { lines: BasketSheetLine[]; subtotal: number }) => void;
}

const BasketContext = createContext<BasketContextValue | null>(null);

/** The basket, or null outside a storefront (the editor's preview). */
export function useBasketIfAny() {
  return use(BasketContext);
}

export function useBasket() {
  const value = use(BasketContext);
  if (!value) throw new Error("useBasket needs a BasketProvider");
  return value;
}

/**
 * The basket the header shows, shared with the product page so a saved add
 * reaches the count and the drawer without rendering the page again.
 */
export function BasketProvider({
  lines: storedLines,
  subtotal: storedSubtotal,
  currency,
  base,
  children,
}: {
  lines: BasketSheetLine[];
  subtotal: number;
  currency: string;
  /** The storefront in the shopper's language: `/s/<slug>` or `/s/<slug>/de`. */
  base: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // Kept only while the layout still holds the basket it was saved over; a
  // fresh render of the layout carries the stored basket itself.
  const [saved, setSaved] = useState<{
    over: BasketSheetLine[];
    lines: BasketSheetLine[];
    subtotal: number;
  } | null>(null);
  const current = saved?.over === storedLines ? saved : { lines: storedLines, subtotal: storedSubtotal };

  const showSaved = useCallback(
    (basket: { lines: BasketSheetLine[]; subtotal: number }) => setSaved({ over: storedLines, ...basket }),
    [storedLines],
  );

  const value = useMemo<BasketContextValue>(
    () => ({ lines: current.lines, subtotal: current.subtotal, currency, base, open, setOpen, showSaved }),
    [current.lines, current.subtotal, currency, base, open, showSaved],
  );

  return <BasketContext value={value}>{children}</BasketContext>;
}

/**
 * The header basket. The drawer is the quick look — what is in the basket, what
 * it comes to and the way on to checkout — and `/s/[slug]/cart` is still the
 * full page where quantities are edited and a discount code is entered. Both
 * read the same cart and post to the same server actions.
 */
export function BasketSheet({ storeId }: { storeId: string }) {
  const t = useTranslations("storefront.basket");
  const chrome = useTranslations("storefront.chrome");
  const format = useFormatter();
  const { lines, subtotal, currency, base, open, setOpen } = useBasket();
  const count = lines.reduce((sum, l) => sum + l.quantity, 0);
  const label = count > 0 ? chrome("basketWithCount", { count }) : chrome("basket");

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {/* On a phone the header has one row, so the basket is an icon with
            the item count; the full label comes back from md up. */}
        <Button
          variant="outline"
          size="lg"
          aria-label={label}
          className="relative max-md:w-9 max-md:px-0"
        >
          <ShoppingBag aria-hidden className="size-4.5 md:hidden" />
          <span className="max-md:hidden">{label}</span>
          {count > 0 ? (
            <span
              aria-hidden
              className="absolute -top-1.5 -right-1.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-primary px-1 text-[0.6875rem] leading-none font-medium tabular-nums text-primary-foreground md:hidden"
            >
              {count}
            </span>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent
        aria-describedby={undefined}
        className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
      >
        <SheetHeader>
          <SheetTitle>{t("title")}</SheetTitle>
        </SheetHeader>
        <Separator />

        {lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="font-heading text-base text-foreground">{t("emptyTitle")}</p>
            <Link
              href={`${base}/products`}
              onClick={() => setOpen(false)}
              className={buttonVariants({ size: "lg" })}
            >
              {t("browseShop")}
            </Link>
          </div>
        ) : (
          <ul className="flex-1 divide-y divide-border overflow-y-auto px-4">
            {lines.map((line) => (
              <li key={line.id} className="flex gap-3 py-4">
                <LineThumbnail
                  previewUrl={line.previewUrl}
                  previewOverlay={line.previewOverlay}
                  text={line.text}
                  artworkUrl={line.artworkUrl}
                  artworkPlacement={line.artworkPlacement}
                  alt=""
                  className="size-16"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{line.productName}</p>
                  <p className="text-xs text-muted-foreground">
                    {line.variantName} × {line.quantity}
                  </p>
                  {line.text ? (
                    <p className="mt-0.5 truncate text-xs text-inksoft">
                      {t("personalisation")} {line.text}
                    </p>
                  ) : null}
                  <form action={removeCartItem} className="mt-1">
                    <input type="hidden" name="storeId" value={storeId} />
                    <input type="hidden" name="itemId" value={line.id} />
                    <Button type="submit" variant="ghost" size="xs" className="text-destructive">
                      {t("remove")}
                    </Button>
                  </form>
                </div>
                <p className="shrink-0 text-sm font-medium tabular-nums text-foreground">
                  {formatMinorUnits(format, line.amount, currency)}
                </p>
              </li>
            ))}
          </ul>
        )}

        {lines.length > 0 ? (
          <SheetFooter className="border-t border-border">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">{t("subtotal")}</span>
              <span className="font-medium tabular-nums text-foreground">
                {formatMinorUnits(format, subtotal, currency)}
              </span>
            </div>
            <Link
              href={`${base}/checkout`}
              onClick={() => setOpen(false)}
              className={cn(buttonVariants({ size: "lg" }), "w-full")}
            >
              {t("checkout")}
            </Link>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full"
              onClick={() => setOpen(false)}
            >
              {t("keepShopping")}
            </Button>
            <Link
              href={`${base}/cart`}
              onClick={() => setOpen(false)}
              className="self-center text-sm text-muted-foreground hover:text-foreground hover:underline"
            >
              {t("viewBasket")}
            </Link>
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
