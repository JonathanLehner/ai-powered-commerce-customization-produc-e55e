import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { deleteAddress, signOutShopper } from "@/app/actions/account";
import { SubmitButton } from "@/components/forms";
import { notFoundRobots, UnknownStoreView } from "@/components/NotFoundViews";
import { Badge } from "@/components/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ShopperMessages } from "@/i18n/shopper-copy";
import { shopperIntl, shopperLocale, shopperTranslator } from "@/i18n/storefront";
import { getShopperAccount, linkCustomerAccount } from "@/lib/accounts";
import { localCountryName } from "@/lib/countries";
import { listCustomerOrders } from "@/lib/customer-data";
import { orderStatusUrl, signOrderToken } from "@/lib/order-access";
import { shopperPageMetadata } from "@/lib/storefront-meta";
import { storefrontBySlug } from "@/lib/storefront-data";
import type { OrderStatus } from "@/lib/types";
import { AddressForm, MarketingForm } from "./AccountForms";

type Params = Promise<{ slug: string; locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug, locale } = await params;
  const store = (await storefrontBySlug(slug))?.store ?? null;
  if (!store) return notFoundRobots;
  const active = shopperLocale(store, locale);
  const t = await shopperTranslator(store, active);
  return shopperPageMetadata(store, active, "/account", { title: t("account.title"), robots: { index: false, follow: false } });
}

const STATUS_LABEL: Record<OrderStatus, keyof ShopperMessages["status"]> = {
  awaiting_payment: "awaitingPayment",
  paid: "paid",
  in_production: "inProduction",
  shipped: "shipped",
  delivered: "delivered",
  cancelled: "cancelled",
  exception: "exception",
};

/** The signed-in shopper's orders, addresses and email preferences in this store. */
export default async function AccountPage({ params }: { params: Params }) {
  const { slug, locale: requested } = await params;
  const store = (await storefrontBySlug(slug))?.store ?? null;
  if (!store) return <UnknownStoreView slug={slug} />;
  const { locale, t, format, money, base } = await shopperIntl(store, requested, `/s/${store.slug}`);
  const account = await getShopperAccount();
  if (!account) redirect(`${base}/account/login`);

  const [customer, orders] = await Promise.all([
    linkCustomerAccount(store, account),
    listCustomerOrders(store.id, account.email),
  ]);
  // A checkout that was never paid is not an order the shopper placed.
  const placed = orders.filter((order) => !(order.status === "cancelled" && order.payment.status === "failed"));
  const links = await Promise.all(placed.map(async (order) => orderStatusUrl(base, order.code, await signOrderToken(store.id, order.code))));
  const addresses = customer.addresses ?? [];
  const homeCountry = store.stripe.country?.toUpperCase() || "US";

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">{t("account.title")}</h1>
          <p className="mt-2 text-sm text-inksoft">{t("account.signedInAs", { email: account.email })}</p>
        </div>
        <form action={signOutShopper}>
          <input type="hidden" name="storeId" value={store.id} />
          <SubmitButton variant="outline" pendingLabel={t("account.signingOut")}>
            {t("account.signOut")}
          </SubmitButton>
        </form>
      </div>

      <section className="mt-10" aria-labelledby="orders-heading">
        <h2 id="orders-heading" className="font-heading text-lg font-semibold text-foreground">
          {t("account.orders")}
        </h2>
        {placed.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {t("account.noOrders")}{" "}
            <Link href={`${base}/products`} className="font-medium text-primary hover:underline">
              {t("account.startShopping")}
            </Link>
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
            {placed.map((order, index) => (
              <li key={order.id}>
                <Link href={links[index]} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-muted/50">
                  <span className="font-mono text-sm font-medium text-foreground">{order.code}</span>
                  <span className="text-sm text-muted-foreground">
                    {format.dateTime(new Date(order.createdAt), { dateStyle: "medium" })}
                  </span>
                  <Badge tone={order.status === "delivered" ? "green" : order.status === "cancelled" ? "slate" : "brand"}>
                    {t(`status.${STATUS_LABEL[order.status]}`)}
                  </Badge>
                  <span className="ml-auto text-sm tabular-nums text-foreground">{money(order.total, order.currency)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-12" aria-labelledby="addresses-heading">
        <h2 id="addresses-heading" className="font-heading text-lg font-semibold text-foreground">
          {t("account.addresses")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("account.addressesHint")}</p>
        {addresses.length > 0 ? (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {addresses.map((address) => (
              <li key={address.id}>
                <Card size="sm">
                  <CardContent className="space-y-3 text-sm">
                    {address.isDefault ? <Badge tone="brand">{t("account.default")}</Badge> : null}
                    <address className="not-italic text-inksoft">
                      {address.name}
                      <br />
                      {address.line1}
                      {address.line2 ? (
                        <>
                          <br />
                          {address.line2}
                        </>
                      ) : null}
                      <br />
                      {[address.postalCode, address.city, address.region].filter(Boolean).join(" ")}
                      <br />
                      {localCountryName(address.country, locale)}
                    </address>
                    <div className="flex flex-wrap gap-2">
                      <details className="w-full">
                        <summary className="cursor-pointer text-sm font-medium text-primary">{t("account.edit")}</summary>
                        <div className="mt-3">
                          <AddressForm storeId={store.id} address={address} defaultCountry={homeCountry} idPrefix={address.id} />
                        </div>
                      </details>
                      <form action={deleteAddress}>
                        <input type="hidden" name="storeId" value={store.id} />
                        <input type="hidden" name="addressId" value={address.id} />
                        <SubmitButton variant="ghost" size="sm" pendingLabel={t("account.saving")}>
                          {t("account.remove")}
                        </SubmitButton>
                      </form>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        ) : null}
        <Card className="mt-4">
          <CardHeader>
            <CardTitle asChild className="text-sm font-semibold">
              <h3>{t("account.addAddress")}</h3>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AddressForm key={addresses.length} storeId={store.id} defaultCountry={homeCountry} idPrefix="new-address" />
          </CardContent>
        </Card>
      </section>

      <section className="mt-12" aria-labelledby="marketing-heading">
        <h2 id="marketing-heading" className="font-heading text-lg font-semibold text-foreground">
          {t("account.marketing")}
        </h2>
        <div className="mt-4">
          <MarketingForm storeId={store.id} subscribed={customer.marketing?.subscribed ?? false} />
        </div>
      </section>
    </div>
  );
}
