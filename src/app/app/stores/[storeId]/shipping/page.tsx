import { TruckIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge, Callout, EmptyState, PageHeader } from "@/components/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { localCountryName } from "@/lib/countries";
import { listShippingZones } from "@/lib/data";
import { paymentMode } from "@/lib/payment-mode";
import { MAX_RATES_PER_ZONE, storeTax } from "@/lib/shipping";
import { requireStoreAccess } from "@/lib/session";
import type { ShippingRate, ShippingZone } from "@/lib/types";
import { formatMoney } from "@/lib/util";
import { DeleteRate, DeleteZone, RateForm, TaxForm, ZoneForm } from "./ShippingForms";

const TH = "px-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase";

/** Every country of the other zones, keyed to the zone that ships there. */
function takenBy(zones: ShippingZone[], except?: string): Record<string, string> {
  return Object.fromEntries(
    zones.filter((zone) => zone.id !== except).flatMap((zone) => zone.countries.map((code) => [code, zone.name])),
  );
}

export default async function ShippingPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const { store } = await requireStoreAccess(storeId, "store.settings");
  const [zones, t, pages, locale] = await Promise.all([
    listShippingZones(storeId),
    getTranslations("shipping"),
    getTranslations("pages.store"),
    getLocale(),
  ]);
  const tax = storeTax(store);
  const money = (minor: number, currency: string) => formatMoney(minor, currency, locale);

  function price(rate: ShippingRate, currency: string): string {
    const amount = (minor: number) => (minor === 0 ? t("free") : money(minor, currency));
    switch (rate.kind) {
      case "flat":
        return amount(rate.amount);
      case "free_over":
        return t("freeOver", { price: amount(rate.amount), threshold: money(rate.threshold ?? 0, currency) });
      case "weight":
      case "subtotal":
        return rate.tiers
          .map((tier) =>
            tier.upTo === null
              ? t("tierAbove", { price: amount(tier.amount) })
              : t("tierUpTo", {
                  limit: rate.kind === "weight" ? t("grams", { value: tier.upTo }) : money(tier.upTo, currency),
                  price: amount(tier.amount),
                }),
          )
          .join(" · ");
    }
  }

  const countries = (zone: ShippingZone) => {
    const names = zone.countries.map((code) => localCountryName(code, locale)).sort((a, b) => a.localeCompare(b, locale));
    return names.length > 6 ? t("countriesMore", { list: names.slice(0, 6).join(", "), count: names.length - 6 }) : names.join(", ");
  };

  return (
    <div className="space-y-8">
      <PageHeader title={pages("shippingTitle")} description={t("intro")} />

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-foreground">{t("zonesTitle")}</h2>
        {zones.length === 0 ? (
          <EmptyState
            icon={<TruckIcon aria-hidden className="size-6" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
          />
        ) : (
          <ul className="space-y-4">
            {zones.map((zone) => (
              <li key={zone.id} id={zone.id} className="scroll-mt-24">
                <Card>
                  <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle asChild>
                          <h3 className="flex flex-wrap items-center gap-2">
                            {zone.name}
                            <Badge tone="slate">{t("countryCount", { count: zone.countries.length })}</Badge>
                            {zone.rates.length === 0 ? <Badge tone="amber">{t("noRatesBadge")}</Badge> : null}
                          </h3>
                        </CardTitle>
                        <p className="mt-1 text-sm text-muted-foreground">{countries(zone)}</p>
                      </div>
                      <DeleteZone storeId={storeId} zoneId={zone.id} name={zone.name} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {zone.rates.length === 0 ? (
                      <Callout tone="amber">{t("noRates")}</Callout>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table className="min-w-[36rem]">
                          <TableHeader>
                            <TableRow className="hover:bg-transparent">
                              <TableHead className={TH}>{t("colRate")}</TableHead>
                              <TableHead className={TH}>{t("colPrice")}</TableHead>
                              <TableHead className={TH}>{t("colDelivery")}</TableHead>
                              <TableHead className={TH}>
                                <span className="sr-only">{t("colActions")}</span>
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {zone.rates.map((rate) => (
                              <TableRow key={rate.id} className="hover:bg-transparent">
                                <TableCell className="px-0 py-2 align-top">
                                  <span className="font-medium text-foreground">{rate.name}</span>
                                  <span className="block text-xs text-muted-foreground">{t(`kinds.${rate.kind}`)}</span>
                                </TableCell>
                                <TableCell className="px-0 py-2 align-top whitespace-normal tabular-nums text-inksoft">
                                  {price(rate, zone.currency)}
                                </TableCell>
                                <TableCell className="px-0 py-2 align-top text-inksoft">
                                  {t("deliveryDays", { min: rate.minDays, max: rate.maxDays })}
                                </TableCell>
                                <TableCell className="px-0 py-2 text-right align-top">
                                  <DeleteRate storeId={storeId} zoneId={zone.id} rate={rate} />
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}

                    {zone.rates.map((rate) => (
                      <details key={rate.id} className="rounded-lg border border-border px-4 py-3">
                        <summary className="cursor-pointer text-sm font-medium text-primary">
                          {t("editRate", { name: rate.name })}
                        </summary>
                        <div className="mt-3 border-t border-border pt-4">
                          <RateForm key={`${rate.id}-${zone.updatedAt}`} storeId={storeId} zone={zone} rate={rate} />
                        </div>
                      </details>
                    ))}
                    {zone.rates.length < MAX_RATES_PER_ZONE ? (
                      <details open={zone.rates.length === 0} className="rounded-lg border border-border px-4 py-3">
                        <summary className="cursor-pointer text-sm font-medium text-primary">{t("addRate")}</summary>
                        <div className="mt-3 border-t border-border pt-4">
                          <RateForm key={`new-${zone.updatedAt}`} storeId={storeId} zone={zone} />
                        </div>
                      </details>
                    ) : (
                      <p className="text-xs text-muted-foreground">{t("rateLimit", { max: MAX_RATES_PER_ZONE })}</p>
                    )}
                    <details className="rounded-lg border border-border px-4 py-3">
                      <summary className="cursor-pointer text-sm font-medium text-primary">
                        {t("editZone", { name: zone.name })}
                      </summary>
                      <div className="mt-3 border-t border-border pt-4">
                        <ZoneForm key={zone.updatedAt} storeId={storeId} zone={zone} taken={takenBy(zones, zone.id)} />
                      </div>
                    </details>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}

        <Card>
          <CardHeader>
            <CardTitle asChild>
              <h3>{t("createTitle")}</h3>
            </CardTitle>
            <p className="text-sm text-muted-foreground">{t("createBody", { currency: store.defaultCurrency })}</p>
          </CardHeader>
          <CardContent>
            <ZoneForm key={zones.length} storeId={storeId} taken={takenBy(zones)} />
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-foreground">{t("taxTitle")}</h2>
        <Card>
          <CardContent className="space-y-4">
            {tax.mode === "stripe" ? (
              <Callout tone="green">{t("stripeTaxOn")}</Callout>
            ) : tax.stripeTax && tax.stripeTax.status !== "active" ? (
              <Callout tone="amber">{t("stripeTaxPendingNote")}</Callout>
            ) : null}
            <TaxForm
              storeId={storeId}
              settings={tax}
              pricesIncludeTax={store.pricesIncludeTax}
              stripeConnected={paymentMode(store) === "stripe"}
            />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
