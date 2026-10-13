import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listAbandonedCheckouts } from "@/lib/checkout-recovery";
import { recoverySettings, recoveryState, type RecoveryState } from "@/lib/order-ops";
import { requireStoreAccess, roleCan } from "@/lib/session";
import { formatDateTime, formatMoney } from "@/lib/util";
import { OrdersTabs } from "../OrdersTabs";
import { RecoveryForm } from "./RecoveryForm";

/** The column-head style every table in the workspace shares. */
const TH = "px-0 text-xs font-semibold tracking-wide uppercase text-muted-foreground";

const TONES: Record<RecoveryState, "green" | "brand" | "amber" | "slate"> = {
  recovered: "green",
  sent: "brand",
  scheduled: "amber",
  noConsent: "slate",
  off: "slate",
  expired: "slate",
};

export default async function AbandonedCheckoutsPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const { store, role } = await requireStoreAccess(storeId, "store.orders");
  const [rows, t, pages, locale] = await Promise.all([
    listAbandonedCheckouts(store.id),
    getTranslations("abandoned"),
    getTranslations("pages.store"),
    getLocale(),
  ]);
  const settings = recoverySettings(store);
  const now = new Date();

  return (
    <div className="space-y-6">
      <PageHeader title={pages("ordersTitle")} />
      <OrdersTabs storeId={store.id} active="abandoned" />

      {roleCan(role, "store.settings") ? (
        <Card asChild>
          <section>
            <CardHeader>
              <CardTitle asChild>
                <h2>{t("recoveryTitle")}</h2>
              </CardTitle>
              <p className="text-sm text-muted-foreground">{t("recoveryBody")}</p>
            </CardHeader>
            <CardContent>
              <RecoveryForm storeId={store.id} settings={settings} />
            </CardContent>
          </section>
        </Card>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState title={t("emptyTitle")} description={t("emptyBody")} />
      ) : (
        <Card asChild>
          <section>
            <CardHeader>
              <CardTitle asChild>
                <h2>{t("listTitle", { count: rows.length })}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative overflow-x-auto">
                <Table className="min-w-[48rem]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className={TH}>{t("columns.date")}</TableHead>
                      <TableHead className={TH}>{t("columns.customer")}</TableHead>
                      <TableHead className={TH}>{t("columns.items")}</TableHead>
                      <TableHead className={`${TH} text-right`}>{t("columns.total")}</TableHead>
                      <TableHead className={`${TH} text-right`}>{t("columns.recovery")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((order) => {
                      const state = recoveryState(order, settings, now);
                      const units = order.items.reduce((sum, item) => sum + item.quantity, 0);
                      return (
                        <TableRow key={order.id} className="hover:bg-transparent">
                          <TableCell className="px-0 py-3 align-top text-xs text-inksoft">
                            {formatDateTime(order.abandoned?.at ?? order.createdAt, locale)}
                          </TableCell>
                          <TableCell className="px-0 py-3 align-top whitespace-normal">
                            {order.customer.anonymisedAt ? (
                              <p className="text-sm text-muted-foreground">{t("deleted")}</p>
                            ) : (
                              <>
                                <p className="text-sm font-medium text-foreground">{order.customer.name}</p>
                                <a href={`mailto:${order.customer.email}`} className="text-xs text-primary hover:underline">
                                  {order.customer.email}
                                </a>
                              </>
                            )}
                          </TableCell>
                          <TableCell className="px-0 py-3 align-top text-sm whitespace-normal text-inksoft">
                            <p>{t("units", { count: units })}</p>
                            <p className="text-xs text-muted-foreground">
                              {order.items.map((item) => item.productName).join(", ")}
                            </p>
                          </TableCell>
                          <TableCell className="px-0 py-3 text-right align-top text-sm font-medium tabular-nums">
                            {formatMoney(order.total, order.currency, locale)}
                          </TableCell>
                          <TableCell className="px-0 py-3 text-right align-top">
                            <Badge tone={TONES[state]}>{t(`state.${state}`)}</Badge>
                            {state === "sent" && order.abandoned?.recoveryEmailAt ? (
                              <p className="mt-1 text-xs text-muted-foreground">
                                {formatDateTime(order.abandoned.recoveryEmailAt, locale)}
                              </p>
                            ) : null}
                            {state === "recovered" && order.abandoned?.recoveredOrderId ? (
                              <Link
                                href={`/app/stores/${store.id}/orders/${order.abandoned.recoveredOrderId}`}
                                className="mt-1 block text-xs text-primary hover:underline"
                              >
                                {t("viewOrder")}
                              </Link>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </section>
        </Card>
      )}
    </div>
  );
}
