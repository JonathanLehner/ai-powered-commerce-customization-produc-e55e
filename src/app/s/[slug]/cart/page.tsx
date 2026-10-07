import type { Metadata } from "next";
import Link from "next/link";
import { readCurrency, readShopperSession, removeCartItem, updateCartItem } from "@/app/actions/shop";
import { DiscountEntry } from "@/components/DiscountEntry";
import { notFoundRobots, UnknownStoreView } from "@/components/NotFoundViews";
import { EmptyState } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { basketTotals, cartDiscountCode } from "@/lib/basket";
import { getCart, getStoreBySlug } from "@/lib/data";
import { fmt, storefrontLocale } from "@/lib/i18n";

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
    <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{t.basket.title}</h1>

      {items.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            title={t.basket.emptyTitle}
            description={t.basket.emptyBody}
            action={
              <Button asChild>
                <Link href={`/s/${store.slug}/products`}>{t.basket.browseShop}</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-14">
          <ul className="divide-y divide-line border-y border-line">
            {lines.map(({ item, unit }) => (
              <li key={item.id} className="flex flex-wrap gap-5 py-6">
                {item.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.previewUrl}
                    alt={fmt(t.basket.previewAlt, { name: item.productName })}
                    width={96}
                    height={120}
                    loading="lazy"
                    className="h-[120px] w-24 shrink-0 rounded-card border border-line bg-secondary object-cover"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{item.productName}</p>
                  <p className="mt-0.5 text-xs text-muted">{item.variantName}</p>
                  {item.text ? (
                    <p className="mt-1.5 text-xs text-inksoft">
                      {t.basket.personalisation}{" "}
                      <span className="font-medium text-ink">{item.text}</span>
                    </p>
                  ) : null}
                  {item.artworkFileName ? (
                    <p className="mt-1 text-xs text-inksoft">
                      {fmt(t.basket.artwork, { file: item.artworkFileName })}
                    </p>
                  ) : null}

                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                    <form action={updateCartItem} className="flex items-center gap-2">
                      <input type="hidden" name="storeId" value={store.id} />
                      <input type="hidden" name="itemId" value={item.id} />
                      <label htmlFor={`qty-${item.id}`} className="text-xs text-muted">
                        {t.basket.quantity}
                      </label>
                      <Input
                        id={`qty-${item.id}`}
                        name="quantity"
                        type="number"
                        min={0}
                        max={50}
                        defaultValue={item.quantity}
                        className="h-9 w-18 tabular-nums"
                      />
                      <Button type="submit" variant="outline" size="sm" className="h-9">
                        {t.basket.update}
                      </Button>
                    </form>
                    <form action={removeCartItem}>
                      <input type="hidden" name="storeId" value={store.id} />
                      <input type="hidden" name="itemId" value={item.id} />
                      <Button type="submit" variant="ghost" size="sm" className="h-9 text-rose-700">
                        {t.basket.remove}
                      </Button>
                    </form>
                  </div>
                </div>
                <p className="shrink-0 text-sm font-medium tabular-nums text-ink">
                  {money(unit * item.quantity, currency)}
                </p>
              </li>
            ))}
          </ul>

          <aside className="h-fit rounded-card border border-border bg-card p-5 lg:sticky lg:top-24">
              <h2 className="text-base font-semibold text-ink">{t.basket.summary}</h2>
              <dl className="mt-5 space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">{t.basket.subtotal}</dt>
                  <dd className="font-medium tabular-nums text-ink">{money(subtotal, currency)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">{t.basket.shipping}</dt>
                  <dd className="font-medium tabular-nums text-ink">{money(shipping, currency)}</dd>
                </div>
                {discount ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">{fmt(t.discount.row, { code: discount.code })}</dt>
                    <dd className="font-medium tabular-nums text-emerald-700">
                      − {money(discount.amount, currency)}
                    </dd>
                  </div>
                ) : null}
                {taxRows.map((row) => (
                  <div key={row.rate} className="flex justify-between gap-4">
                    <dt className="text-muted">
                      {fmt(t.basket.taxRow, { rate: row.rate })}{" "}
                      {store.pricesIncludeTax ? t.basket.taxIncludedSuffix : ""}
                    </dt>
                    <dd className="font-medium tabular-nums text-ink">{money(row.amount, currency)}</dd>
                  </div>
                ))}
                <div className="flex justify-between gap-4 border-t border-line pt-3">
                  <dt className="font-semibold text-ink">{t.basket.total}</dt>
                  <dd className="text-base font-semibold tabular-nums text-ink">
                    {money(total, currency)}
                  </dd>
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
              <Button asChild size="lg" className="mt-5 w-full">
                <Link href={`/s/${store.slug}/checkout`}>{t.basket.checkout}</Link>
              </Button>
              <Button asChild variant="ghost" className="mt-2 w-full">
                <Link href={`/s/${store.slug}/products`}>{t.basket.keepShopping}</Link>
              </Button>
          </aside>
        </div>
      )}
    </div>
  );
}
