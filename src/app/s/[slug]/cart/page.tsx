import type { Metadata } from "next";
import Link from "next/link";
import { readCurrency, readShopperSession, removeCartItem, updateCartItem } from "@/app/actions/shop";
import { DiscountEntry } from "@/components/DiscountEntry";
import { notFoundRobots, UnknownStoreView } from "@/components/NotFoundViews";
import { EmptyState } from "@/components/ui";
import { basketTotals, cartDiscountCode } from "@/lib/basket";
import { getCart, getStoreBySlug } from "@/lib/data";
import { fmt, storefrontLocale } from "@/lib/i18n";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) return { title: "Basket", ...notFoundRobots };
  return { title: storefrontLocale(store).t.basket.title };
}

export default async function CartPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  // A slug that belongs to no store renders the "not this address" page in
  // Parcelith's own chrome, server-side, rather than raising notFound().
  if (!store) return <UnknownStoreView slug={slug} />;

  const currency = await readCurrency(store.defaultCurrency, store.currencies);
  const { t, money } = storefrontLocale(store);
  const session = await readShopperSession();
  const cart = session ? await getCart(store.id, session) : null;
  const items = cart?.items ?? [];

  const discountCode = await cartDiscountCode(store.id, cart);
  const { lines, subtotal, discount, discountRefusal, discountMinimum, shipping, taxRows, total } =
    await basketTotals(store, items, currency, discountCode);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">{t.basket.title}</h1>

      {items.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title={t.basket.emptyTitle}
            description={t.basket.emptyBody}
            action={
              <Link href={`/s/${store.slug}/products`} className={buttonVariants({ size: "lg" })}>
                {t.basket.browseShop}
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <ul className="divide-y divide-border">
            {lines.map(({ item, unit }) => (
              <li key={item.id} className="flex flex-wrap gap-4 py-5">
                {item.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.previewUrl}
                    alt={fmt(t.basket.previewAlt, { name: item.productName })}
                    width={112}
                    height={112}
                    loading="lazy"
                    className="h-28 w-[5.6rem] shrink-0 rounded-lg border border-border bg-muted object-cover"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{item.productName}</p>
                  <p className="text-xs text-muted-foreground">{item.variantName}</p>
                  {item.text ? (
                    <p className="mt-1 text-xs text-inksoft">
                      {t.basket.personalisation}{" "}
                      <span className="font-medium text-foreground">{item.text}</span>
                    </p>
                  ) : null}
                  {item.artworkFileName ? (
                    <p className="mt-1 text-xs text-inksoft">
                      {fmt(t.basket.artwork, { file: item.artworkFileName })}
                    </p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <form action={updateCartItem} className="flex items-center gap-2">
                      <input type="hidden" name="storeId" value={store.id} />
                      <input type="hidden" name="itemId" value={item.id} />
                      <label htmlFor={`qty-${item.id}`} className="text-xs text-muted-foreground">
                        {t.basket.quantity}
                      </label>
                      <Input
                        id={`qty-${item.id}`}
                        name="quantity"
                        type="number"
                        min={0}
                        max={50}
                        defaultValue={item.quantity}
                        className="w-20 py-1 text-sm"
                      />
                      <Button type="submit" variant="outline" size="sm">
                        {t.basket.update}
                      </Button>
                    </form>
                    <form action={removeCartItem}>
                      <input type="hidden" name="storeId" value={store.id} />
                      <input type="hidden" name="itemId" value={item.id} />
                      <Button type="submit" variant="ghost" size="sm" className="text-rose-700">
                        {t.basket.remove}
                      </Button>
                    </form>
                  </div>
                </div>
                <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                  {money(unit * item.quantity, currency)}
                </p>
              </li>
            ))}
          </ul>

          <Card asChild className="h-fit">
          <aside>
            <CardContent>
            <h2 className="font-heading text-base font-semibold text-foreground">{t.basket.summary}</h2>
            <dl className="mt-4 space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t.basket.subtotal}</dt>
                <dd className="font-medium tabular-nums text-foreground">{money(subtotal, currency)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t.basket.shipping}</dt>
                <dd className="font-medium tabular-nums text-foreground">{money(shipping, currency)}</dd>
              </div>
              {discount ? (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{fmt(t.discount.row, { code: discount.code })}</dt>
                  <dd className="font-medium tabular-nums text-emerald-700">
                    − {money(discount.amount, currency)}
                  </dd>
                </div>
              ) : null}
              {taxRows.map((row) => (
                <div key={row.rate} className="flex justify-between">
                  <dt className="text-muted-foreground">
                    {fmt(t.basket.taxRow, { rate: row.rate })}{" "}
                    {store.pricesIncludeTax ? t.basket.taxIncludedSuffix : ""}
                  </dt>
                  <dd className="font-medium tabular-nums text-foreground">{money(row.amount, currency)}</dd>
                </div>
              ))}
              <div className="flex justify-between border-t border-border pt-2.5">
                <dt className="font-semibold text-foreground">{t.basket.total}</dt>
                <dd className="text-base font-semibold tabular-nums text-foreground">{money(total, currency)}</dd>
              </div>
            </dl>
            <DiscountEntry
              storeId={store.id}
              code={cart?.discountCode ?? null}
              note={
                discountRefusal
                  ? fmt(t.discount[discountRefusal], { amount: money(discountMinimum, currency) })
                  : null
              }
              t={t.discount}
            />
            <Link
              href={`/s/${store.slug}/checkout`}
              className={cn(buttonVariants({ size: "lg" }), "mt-5 w-full")}
            >
              {t.basket.checkout}
            </Link>
            <Link
              href={`/s/${store.slug}/products`}
              className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "mt-2 w-full")}
            >
              {t.basket.keepShopping}
            </Link>
            </CardContent>
          </aside>
          </Card>
        </div>
      )}
    </div>
  );
}
