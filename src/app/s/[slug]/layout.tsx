import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { readCurrency, readShopperSession, setCurrency } from "@/app/actions/shop";
import { getCart, getStoreBySlug } from "@/lib/data";
import { THEMES } from "@/lib/types";

export default async function StorefrontLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();

  const theme = THEMES[store.theme];
  const currency = await readCurrency(store.defaultCurrency, store.currencies);
  const session = await readShopperSession();
  const cart = session ? await getCart(store.id, session) : null;
  const cartCount = cart?.items.reduce((sum, i) => sum + i.quantity, 0) ?? 0;

  return (
    <div className="flex min-h-full flex-col bg-white">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <Link href={`/s/${store.slug}`} className="flex min-w-0 items-center gap-2.5">
            {store.logoUrl ? (
              <Image
                src={store.logoUrl}
                alt=""
                width={40}
                height={40}
                sizes="40px"
                className="h-9 w-9 shrink-0 rounded object-contain"
              />
            ) : (
              <span
                aria-hidden
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-sm font-bold text-white"
                style={{ background: theme.accent }}
              >
                {store.name.slice(0, 1)}
              </span>
            )}
            <span className="truncate text-base font-semibold tracking-tight text-ink">{store.name}</span>
          </Link>

          <nav aria-label="Storefront" className="flex items-center gap-1 sm:gap-2">
            <Link
              href={`/s/${store.slug}/products`}
              className="rounded-lg px-2.5 py-2 text-sm font-medium text-inksoft hover:bg-canvas hover:text-ink"
            >
              Shop
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <form action={setCurrency} className="flex items-center gap-1.5">
              <input type="hidden" name="storeId" value={store.id} />
              <input type="hidden" name="slug" value={store.slug} />
              <label htmlFor="currency" className="sr-only">
                Currency
              </label>
              <select
                id="currency"
                name="currency"
                defaultValue={currency}
                className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm text-ink"
              >
                {store.currencies.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn-ghost btn-sm">
                Set
              </button>
            </form>
            <Link
              href={`/s/${store.slug}/cart`}
              className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink hover:bg-canvas"
            >
              Basket{cartCount > 0 ? ` (${cartCount})` : ""}
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-line bg-canvas">
        <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-10 sm:px-6 md:grid-cols-3">
          <div>
            <p className="text-sm font-semibold text-ink">{store.name}</p>
            <p className="mt-1.5 text-sm text-muted">
              Operated by {store.clientName}. Printed on demand and shipped worldwide.
            </p>
          </div>
          <div>
            <p className="section-title">Shop</p>
            <ul className="mt-2 space-y-1.5 text-sm text-inksoft">
              <li>
                <Link href={`/s/${store.slug}/products`} className="hover:underline">
                  All products
                </Link>
              </li>
              <li>
                <Link href={`/s/${store.slug}/cart`} className="hover:underline">
                  Basket
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="section-title">Delivery</p>
            <p className="mt-2 text-sm text-muted">
              {store.carriers
                .filter((c) => c.enabled)
                .map((c) => c.carrier.toUpperCase())
                .join(" · ") || "Carrier setup in progress"}
              . Prices shown in {currency}
              {store.pricesIncludeTax ? ", tax included" : ", tax added at checkout"}.
            </p>
          </div>
        </div>
        <div className="border-t border-line">
          <p className="mx-auto w-full max-w-6xl px-4 py-4 text-xs text-muted sm:px-6">
            © {new Date().getFullYear()} {store.clientName}. {store.clientName} is the merchant of record for
            this store. Storefront powered by Parcelith.
          </p>
        </div>
      </footer>
    </div>
  );
}
