import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { readCurrency, readShopperSession, removeCartItem, updateCartItem } from "@/app/actions/shop";
import { EmptyState } from "@/components/ui";
import { basketTotals } from "@/lib/basket";
import { getCart, getStoreBySlug } from "@/lib/data";
import { fmt, storefrontLocale } from "@/lib/i18n";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) return { title: "Basket" };
  return { title: storefrontLocale(store).t.basket.title };
}

export default async function CartPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();

  const currency = await readCurrency(store.defaultCurrency, store.currencies);
  const { t, money } = storefrontLocale(store);
  const session = await readShopperSession();
  const cart = session ? await getCart(store.id, session) : null;
  const items = cart?.items ?? [];

  const { lines, subtotal, shipping, taxRows, total } = await basketTotals(store, items, currency);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{t.basket.title}</h1>

      {items.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title={t.basket.emptyTitle}
            description={t.basket.emptyBody}
            action={
              <Link href={`/s/${store.slug}/products`} className="btn-primary">
                {t.basket.browseShop}
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <ul className="divide-y divide-line">
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
                    className="h-28 w-28 shrink-0 rounded-lg border border-line bg-canvas object-cover"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{item.productName}</p>
                  <p className="text-xs text-muted">{item.variantName}</p>
                  {item.text ? (
                    <p className="mt-1 text-xs text-inksoft">
                      {t.basket.personalisation}{" "}
                      <span className="font-medium text-ink">{item.text}</span>
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
                      <label htmlFor={`qty-${item.id}`} className="text-xs text-muted">
                        {t.basket.quantity}
                      </label>
                      <input
                        id={`qty-${item.id}`}
                        name="quantity"
                        type="number"
                        min={0}
                        max={50}
                        defaultValue={item.quantity}
                        className="input mt-0 w-20 py-1 text-sm"
                      />
                      <button type="submit" className="btn-secondary btn-sm">
                        {t.basket.update}
                      </button>
                    </form>
                    <form action={removeCartItem}>
                      <input type="hidden" name="storeId" value={store.id} />
                      <input type="hidden" name="itemId" value={item.id} />
                      <button type="submit" className="btn-ghost btn-sm text-rose-700">
                        {t.basket.remove}
                      </button>
                    </form>
                  </div>
                </div>
                <p className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                  {money(unit * item.quantity, currency)}
                </p>
              </li>
            ))}
          </ul>

          <aside className="h-fit rounded-xl border border-line bg-canvas p-5">
            <h2 className="text-base font-semibold text-ink">{t.basket.summary}</h2>
            <dl className="mt-4 space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">{t.basket.subtotal}</dt>
                <dd className="font-medium tabular-nums text-ink">{money(subtotal, currency)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">{t.basket.shipping}</dt>
                <dd className="font-medium tabular-nums text-ink">{money(shipping, currency)}</dd>
              </div>
              {taxRows.map((row) => (
                <div key={row.rate} className="flex justify-between">
                  <dt className="text-muted">
                    {fmt(t.basket.taxRow, { rate: row.rate })}{" "}
                    {store.pricesIncludeTax ? t.basket.taxIncludedSuffix : ""}
                  </dt>
                  <dd className="font-medium tabular-nums text-ink">{money(row.amount, currency)}</dd>
                </div>
              ))}
              <div className="flex justify-between border-t border-line pt-2.5">
                <dt className="font-semibold text-ink">{t.basket.total}</dt>
                <dd className="text-base font-semibold tabular-nums text-ink">{money(total, currency)}</dd>
              </div>
            </dl>
            <Link href={`/s/${store.slug}/checkout`} className="btn-primary mt-5 w-full">
              {t.basket.checkout}
            </Link>
            <Link href={`/s/${store.slug}/products`} className="btn-ghost mt-2 w-full">
              {t.basket.keepShopping}
            </Link>
          </aside>
        </div>
      )}
    </div>
  );
}
