import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { readCurrency, readShopperSession } from "@/app/actions/shop";
import { Callout } from "@/components/ui";
import { basketTotals } from "@/lib/basket";
import { getCart, getStoreBySlug } from "@/lib/data";
import { formatMoney } from "@/lib/util";
import { CheckoutForm } from "./CheckoutForm";

export const metadata: Metadata = {
  title: "Checkout",
};

export default async function CheckoutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();

  const session = await readShopperSession();
  const cart = session ? await getCart(store.id, session) : null;
  if (!cart || cart.items.length === 0) redirect(`/s/${store.slug}/cart`);

  const currency = await readCurrency(store.defaultCurrency, store.currencies);
  const { lines, shipping, taxRows, total } = await basketTotals(store, cart.items, currency);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Checkout</h1>
      <p className="mt-2 text-sm text-muted">
        {store.clientName} is the merchant of record. Payment settles into their own Stripe account.
      </p>

      {!store.stripe.connected || !store.stripe.chargesEnabled ? (
        <div className="mt-6">
          <Callout tone="rose" title="This store cannot take payments yet">
            The store has not finished connecting its Stripe account. Your basket is saved — try again once the
            store is live.
            <p className="mt-3">
              <Link href={`/s/${store.slug}/cart`} className="btn-secondary btn-sm">
                Back to basket
              </Link>
            </p>
          </Callout>
        </div>
      ) : (
        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <CheckoutForm
            storeId={store.id}
            currencies={store.currencies}
            currency={currency}
            stripeAccountId={store.stripe.accountId}
          />

          <aside className="h-fit rounded-xl border border-line bg-canvas p-5">
            <h2 className="text-base font-semibold text-ink">Order summary</h2>
            <ul className="mt-4 space-y-3 text-sm">
              {lines.map(({ item, unit }) => (
                <li key={item.id} className="flex justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-ink">{item.productName}</span>
                    <span className="block text-xs text-muted">
                      {item.variantName} × {item.quantity}
                      {item.text ? ` · “${item.text}”` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums text-ink">
                    {formatMoney(unit * item.quantity, currency)}
                  </span>
                </li>
              ))}
            </ul>
            <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Shipping</dt>
                <dd className="tabular-nums text-ink">{formatMoney(shipping, currency)}</dd>
              </div>
              {taxRows.map((row) => (
                <div key={row.rate} className="flex justify-between">
                  <dt className="text-muted">
                    Tax {row.rate}% {store.pricesIncludeTax ? "included" : ""}
                  </dt>
                  <dd className="tabular-nums text-ink">{formatMoney(row.amount, currency)}</dd>
                </div>
              ))}
              <div className="flex justify-between border-t border-line pt-2">
                <dt className="font-semibold text-ink">Total</dt>
                <dd className="text-base font-semibold tabular-nums text-ink">{formatMoney(total, currency)}</dd>
              </div>
            </dl>
          </aside>
        </div>
      )}
    </div>
  );
}
