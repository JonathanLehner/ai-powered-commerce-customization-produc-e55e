"use client";

import { useFormatter, useTranslations } from "next-intl";
import { ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, use, useCallback, useMemo, useOptimistic, useRef, useState } from "react";
import { removeCartItem } from "@/app/actions/shop";
import { formatMinorUnits } from "@/i18n/format";
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
import { cn } from "@/lib/utils";

export interface BasketSheetLine {
  id: string;
  productName: string;
  variantName: string;
  quantity: number;
  /** The line total in minor units of the basket's display currency. */
  amount: number;
  previewUrl: string | null;
  text: string | null;
  /**
   * The variant, for a line with no personalisation: the server folds a second
   * plain add of the same variant into it, so the basket shown while it saves
   * does too. Null for a personalised line, which always stands alone.
   */
  plainVariantId: string | null;
  /** Shown before the server has stored it; it cannot be removed yet. */
  pending?: boolean;
}

interface BasketContextValue {
  lines: BasketSheetLine[];
  /** The subtotal in minor units, including lines still being saved. */
  subtotal: number;
  currency: string;
  base: string;
  open: boolean;
  setOpen: (open: boolean) => void;
  /**
   * Shows a line straight away. Call it inside the add's transition: React
   * drops it once that settles, by which point the refreshed basket carries the
   * stored line, or the add was refused and there is nothing to show.
   */
  addLine: (line: BasketSheetLine) => void;
  /** The add has been answered: go on to a checkout the shopper asked for, or close on a refusal. */
  settle: (ok: boolean, focusAfterClose?: () => HTMLElement | null) => void;
  checkoutQueued: boolean;
  queueCheckout: () => void;
  /** Where focus goes when the drawer closes, if somewhere other than the basket button. */
  takeFocusTarget: () => HTMLElement | null;
}

const BasketContext = createContext<BasketContextValue | null>(null);

export function useBasket() {
  const value = use(BasketContext);
  if (!value) throw new Error("useBasket needs a BasketProvider");
  return value;
}

function withLine(lines: BasketSheetLine[], line: BasketSheetLine): BasketSheetLine[] {
  // A later call for the same line (its preview has been drawn) replaces it.
  if (lines.some((l) => l.id === line.id)) return lines.map((l) => (l.id === line.id ? line : l));
  const same = line.plainVariantId
    ? lines.find((l) => l.plainVariantId === line.plainVariantId)
    : undefined;
  if (!same) return [...lines, line];
  return lines.map((l) =>
    l === same
      ? {
          ...l,
          quantity: Math.min(50, l.quantity + line.quantity),
          amount: l.amount + line.amount,
          pending: true,
        }
      : l,
  );
}

/**
 * The basket the header shows, shared with the product page so an add appears
 * in the count and the drawer the moment it is pressed while the server stores
 * it in the background.
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
  const router = useRouter();
  const [lines, addLine] = useOptimistic(storedLines, withLine);
  const [open, setOpen] = useState(false);
  const [checkoutQueued, setCheckoutQueued] = useState(false);
  const queued = useRef(false);
  const focusAfterClose = useRef<(() => HTMLElement | null) | null>(null);

  const subtotal =
    storedSubtotal +
    lines.reduce((sum, l) => sum + l.amount, 0) -
    storedLines.reduce((sum, l) => sum + l.amount, 0);

  const settle = useCallback(
    (ok: boolean, focusTarget?: () => HTMLElement | null) => {
      if (ok && queued.current) router.push(`${base}/checkout`);
      queued.current = false;
      setCheckoutQueued(false);
      if (!ok) {
        focusAfterClose.current = focusTarget ?? null;
        setOpen(false);
      }
    },
    [router, base],
  );

  const value = useMemo<BasketContextValue>(
    () => ({
      lines,
      subtotal,
      currency,
      base,
      open,
      setOpen: (next: boolean) => {
        if (next) focusAfterClose.current = null;
        setOpen(next);
      },
      addLine,
      settle,
      checkoutQueued,
      queueCheckout: () => {
        queued.current = true;
        setCheckoutQueued(true);
      },
      takeFocusTarget: () => {
        const target = focusAfterClose.current?.() ?? null;
        focusAfterClose.current = null;
        return target;
      },
    }),
    [lines, subtotal, currency, base, open, addLine, settle, checkoutQueued],
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
  const common = useTranslations("common");
  const format = useFormatter();
  const { lines, subtotal, currency, base, open, setOpen, checkoutQueued, queueCheckout, takeFocusTarget } =
    useBasket();
  const count = lines.reduce((sum, l) => sum + l.quantity, 0);
  const saving = lines.some((l) => l.pending);
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
        onCloseAutoFocus={(event) => {
          // Closed because the add was refused: the reason on the product
          // page takes focus, not the basket button.
          const target = takeFocusTarget();
          if (target) {
            event.preventDefault();
            target.focus();
          }
        }}
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
                {line.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={line.previewUrl}
                    alt=""
                    width={64}
                    height={80}
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
                      {t("personalisation")} {line.text}
                    </p>
                  ) : null}
                  {line.pending ? null : (
                    <form action={removeCartItem} className="mt-1">
                      <input type="hidden" name="storeId" value={storeId} />
                      <input type="hidden" name="itemId" value={line.id} />
                      <Button type="submit" variant="ghost" size="xs" className="text-destructive">
                        {t("remove")}
                      </Button>
                    </form>
                  )}
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
              aria-disabled={checkoutQueued || undefined}
              onClick={(event) => {
                // Checkout reads the stored basket, so a line still saving is
                // waited for rather than left behind.
                if (saving) {
                  event.preventDefault();
                  queueCheckout();
                  return;
                }
                setOpen(false);
              }}
              className={cn(
                buttonVariants({ size: "lg" }),
                "w-full",
                checkoutQueued && "pointer-events-none opacity-70",
              )}
            >
              {checkoutQueued ? common("working") : t("checkout")}
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
