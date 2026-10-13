import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { attentionSummary } from "@/i18n/attention-copy";
import { attentionBreakdown, attentionReason, type AttentionReason } from "@/lib/attention";
import { COLLECTIONS, listAttentionOrdersByStore, listStoreProductsByStore } from "@/lib/data";
import { inventoryRows, inventorySettings, lowStockRows } from "@/lib/inventory-rules";
import { db } from "@/lib/mongo";
import type { InventoryLevel } from "@/lib/types";
import { ORDERS_PAGE_SIZE } from "@/lib/order-list";
import { accessibleStores, requireUser } from "@/lib/session";
import { THEMES } from "@/lib/types";
import { formatDate, formatMoney } from "@/lib/util";

const REASON_TONES: Record<AttentionReason, "rose" | "amber" | "brand"> = {
  exception: "rose",
  manual_routing: "amber",
  awaiting_production: "brand",
};

const LOW_STOCK_ROWS = 10;

function storeInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * Every order that needs attention in the stores this user can open, one group
 * per store. Each group is built from that store's own orders only, and each row
 * opens the order inside its store, where the usual store access check applies.
 */
export default async function AttentionPage() {
  const user = await requireUser();
  const accessible = await accessibleStores(user);
  const stores = accessible.filter(({ store }) => store.status === "active");
  const storeIds = stores.map(({ store }) => store.id);
  const [ordersByStore, productsByStore, levels] = await Promise.all([
    listAttentionOrdersByStore(storeIds),
    listStoreProductsByStore(storeIds),
    db.findIn<InventoryLevel>(COLLECTIONS.inventoryLevels, "storeId", storeIds),
  ]);

  const groups = await Promise.all(
    stores.map(async ({ store, viaPlatform }) => {
      // The store id is checked again on each order, so a row can never be
      // listed under, or linked through, a store it does not belong to.
      const orders = (ordersByStore.get(store.id) ?? []).filter(
        (order) => order.storeId === store.id && attentionReason(order) !== null,
      );
      const breakdown = attentionBreakdown(orders);
      // Tracked variants on sale at or below the store's low-stock threshold.
      const lowStock = lowStockRows(
        inventoryRows(
          productsByStore.get(store.id) ?? [],
          levels.filter((level) => level.storeId === store.id),
          inventorySettings(store),
        ),
      );
      return { store, viaPlatform, orders, lowStock, summary: await attentionSummary(breakdown) };
    }),
  );
  const open = groups.filter((group) => group.orders.length > 0 || group.lowStock.length > 0);
  const total = open.reduce((sum, group) => sum + group.orders.length, 0);
  const lowTotal = open.reduce((sum, group) => sum + group.lowStock.length, 0);

  const [t, orderCopy, locale] = await Promise.all([
    getTranslations("attention"),
    getTranslations("orders"),
    getLocale(),
  ]);

  return (
    <>
      <AppHeader user={user} stores={accessible} />
      <div className="mx-auto w-full max-w-[92rem] flex-1 px-4 py-7 sm:px-6">
        <PageHeader
          title={t("title")}
          description={
            total > 0 || lowTotal > 0
              ? [
                  total > 0 ? t("description", { count: total, stores: open.length }) : null,
                  lowTotal > 0 ? t("lowStockCount", { count: lowTotal }) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : undefined
          }
          actions={
            <Button asChild variant="outline" size="sm">
              <Link href="/app">{t("back")}</Link>
            </Button>
          }
        />

        {open.length === 0 ? (
          <div className="mt-6">
            <EmptyState title={t("emptyTitle")} description={t("emptyBody")} />
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            {open.map(({ store, viaPlatform, orders, lowStock, summary }) => {
              const queue = `/app/stores/${store.id}/orders?view=attention`;
              return (
                <section key={store.id} aria-labelledby={`attention-${store.id}`}>
                  <Card>
                    <CardHeader>
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Avatar>
                          <AvatarFallback
                            className="text-xs font-semibold text-white"
                            style={{ background: THEMES[store.theme].accent }}
                          >
                            {storeInitials(store.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <CardTitle asChild className="truncate">
                            <h2 id={`attention-${store.id}`}>
                              <Link href={`/app/stores/${store.id}`} className="hover:underline">
                                {store.name}
                              </Link>
                            </h2>
                          </CardTitle>
                          <p className="truncate text-sm text-muted-foreground">
                            {[orders.length > 0 ? summary : null, lowStock.length > 0 ? t("lowStockCount", { count: lowStock.length }) : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                      </div>
                      {orders.length > 0 ? (
                        <CardAction>
                          <Link href={queue} className="text-sm font-medium text-primary hover:underline">
                            {t("viewInOrders")}
                          </Link>
                        </CardAction>
                      ) : null}
                    </CardHeader>
                    <CardContent className="px-0">
                      {orders.length > 0 ? (
                      <ul className="divide-y divide-border border-t border-border">
                        {orders.slice(0, ORDERS_PAGE_SIZE).map((order) => {
                          const reason = attentionReason(order) as AttentionReason;
                          return (
                            <li key={order.id} className="relative flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 hover:bg-muted/50">
                              <Link
                                href={`/app/stores/${store.id}/orders/${order.id}`}
                                className="w-32 shrink-0 font-medium text-foreground after:absolute after:inset-0 after:content-[''] hover:underline"
                              >
                                {order.code}
                              </Link>
                              <Badge tone={REASON_TONES[reason]}>{t(`reason.${reason}`)}</Badge>
                              {/* Shopper names stay out of platform oversight, as on the store's own Orders page. */}
                              {viaPlatform ? null : (
                                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                                  {order.customer.anonymisedAt ? orderCopy("deletedCustomer") : order.customer.name}
                                </span>
                              )}
                              <span className={viaPlatform ? "ml-auto text-xs text-muted-foreground" : "text-xs text-muted-foreground"}>
                                {formatDate(order.createdAt, locale)}
                              </span>
                              {viaPlatform ? null : (
                                <span className="w-24 text-right text-sm font-medium tabular-nums text-foreground">
                                  {formatMoney(order.total, order.currency, locale)}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                      ) : null}
                      {lowStock.length > 0 ? (
                        <ul className="divide-y divide-border border-t border-border" aria-label={t("lowStockTitle")}>
                          {lowStock.slice(0, LOW_STOCK_ROWS).map((row) => (
                            <li
                              key={`${row.productId}:${row.variantId}`}
                              className="relative flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 hover:bg-muted/50"
                            >
                              <Link
                                href={`/app/stores/${store.id}/catalog/inventory?q=${encodeURIComponent(row.sku || row.productName)}`}
                                className="min-w-0 flex-1 truncate text-sm font-medium text-foreground after:absolute after:inset-0 after:content-[''] hover:underline"
                              >
                                {row.productName} · {row.variantName}
                              </Link>
                              <Badge tone={row.state === "out" ? "rose" : "amber"}>
                                {row.state === "out" ? t("reason.out_of_stock") : t("reason.low_stock")}
                              </Badge>
                              <span className="w-24 text-right text-sm tabular-nums text-foreground">
                                {t("available", { count: row.available })}
                              </span>
                            </li>
                          ))}
                          {lowStock.length > LOW_STOCK_ROWS ? (
                            <li className="px-4 pt-3 text-sm">
                              <Link
                                href={`/app/stores/${store.id}/catalog/inventory?filter=low`}
                                className="font-medium text-primary hover:underline"
                              >
                                {t("viewInventory")} ({lowStock.length})
                              </Link>
                            </li>
                          ) : null}
                        </ul>
                      ) : null}
                      {orders.length > ORDERS_PAGE_SIZE ? (
                        <p className="border-t border-border px-4 pt-3 text-sm">
                          <Link href={queue} className="font-medium text-primary hover:underline">
                            {t("viewInOrders")} ({orders.length})
                          </Link>
                        </p>
                      ) : null}
                    </CardContent>
                  </Card>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
