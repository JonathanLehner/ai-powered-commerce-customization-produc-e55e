import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { StoreWorkspaceNotFoundView } from "@/components/NotFoundViews";
import { Breadcrumbs, Callout, DataList, PageHeader } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { countryName, currencyName, languageName } from "@/i18n/display";
import { getCustomer, listCustomerOrders } from "@/lib/customer-data";
import { requireStoreAccess } from "@/lib/session";
import { formatDate, formatDateTime, formatMoney } from "@/lib/util";
import { CopyEmailButton, DeleteDataButton, ExportDataButton, NoteForm } from "./CustomerActions";

const HEAD = "px-4 text-xs font-semibold tracking-wide uppercase text-muted-foreground";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ storeId: string; customerId: string }>;
}) {
  const { storeId, customerId } = await params;
  const { store } = await requireStoreAccess(storeId, "store.orders");
  const customer = await getCustomer(storeId, customerId);
  if (!customer) return <StoreWorkspaceNotFoundView base={`/app/stores/${storeId}`} />;

  const [orders, t, labels, locale] = await Promise.all([
    listCustomerOrders(storeId, customer.email),
    getTranslations("customers"),
    getTranslations("labels"),
    getLocale(),
  ]);
  const base = `/app/stores/${storeId}`;
  const deleted = Boolean(customer.anonymisedAt);
  const name = deleted ? t("deleted") : customer.name;
  const refunds = orders
    .flatMap((order) => order.refunds.map((refund) => ({ refund, order })))
    .sort((a, b) => b.refund.at.localeCompare(a.refund.at));
  const notes = [...customer.notes].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: store.name, href: base },
          { label: t("title"), href: `${base}/customers` },
          { label: name },
        ]}
      />

      <PageHeader
        title={name}
        description={
          deleted
            ? t("deletedOn", { date: formatDate(customer.anonymisedAt as string, locale) })
            : t("since", { email: customer.email, date: formatDate(customer.firstOrderAt || customer.createdAt, locale) })
        }
        actions={
          <>
            {deleted ? null : <CopyEmailButton email={customer.email} />}
            <ExportDataButton href={`${base}/customers/${customer.id}/export`} />
            {deleted ? null : <DeleteDataButton storeId={storeId} customerId={customer.id} />}
          </>
        }
      />

      {deleted ? <Callout tone="slate">{t("deletedNote")}</Callout> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section>
            <Card>
              <CardHeader>
                <CardTitle asChild>
                  <h2>{t("orderHistory")}</h2>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className={HEAD}>{t("colOrder")}</TableHead>
                      <TableHead className={HEAD}>{t("colStatus")}</TableHead>
                      <TableHead className={`${HEAD} text-right`}>{t("colTotal")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order) => (
                      <TableRow key={order.id} className="relative">
                        <TableCell className="px-4 py-3">
                          <Link
                            href={`${base}/orders/${order.id}`}
                            className="font-medium text-foreground after:absolute after:inset-0 after:content-[''] hover:underline"
                          >
                            {order.code}
                          </Link>
                          <p className="text-xs text-muted-foreground">{formatDate(order.createdAt, locale)}</p>
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <Badge variant="outline">{labels(`orderStatus.${order.status}`)}</Badge>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-right font-medium tabular-nums text-foreground">
                          {formatMoney(order.total, order.currency, locale)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </section>

          <section>
            <Card>
              <CardHeader>
                <CardTitle asChild>
                  <h2>{t("refunds")}</h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {refunds.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("noRefunds")}</p>
                ) : (
                  <ul className="divide-y divide-border border-t border-border">
                    {refunds.map(({ refund, order }) => (
                      <li key={refund.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
                        <div className="min-w-0">
                          <Link href={`${base}/orders/${order.id}`} className="font-medium text-foreground hover:underline">
                            {order.code}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {formatDateTime(refund.at, locale)} · {refund.actor}
                          </p>
                          <p className="mt-1 text-inksoft">{refund.reason}</p>
                        </div>
                        <span className="font-medium tabular-nums text-foreground">
                          {formatMoney(refund.amount, order.currency, locale)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </section>
        </div>

        <div className="space-y-6">
          <section>
            <Card>
              <CardHeader>
                <CardTitle asChild>
                  <h2>{t("profile")}</h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DataList
                  rows={[
                    { label: t("email"), value: deleted ? labels("none") : customer.email },
                    { label: t("country"), value: customer.country ? countryName(locale, customer.country) : labels("notSet") },
                    { label: t("firstOrder"), value: customer.firstOrderAt ? formatDate(customer.firstOrderAt, locale) : labels("none") },
                    { label: t("lastOrder"), value: customer.lastOrderAt ? formatDate(customer.lastOrderAt, locale) : labels("none") },
                    { label: t("orders"), value: String(customer.orderCount) },
                    { label: t("spend"), value: formatMoney(customer.lifetimeSpend, customer.currency, locale) },
                    { label: t("refunded"), value: formatMoney(customer.refundedTotal, customer.currency, locale) },
                    { label: t("language"), value: languageName(locale, customer.preferredLanguage) },
                    { label: t("currency"), value: currencyName(locale, customer.preferredCurrency) },
                    {
                      label: t("account"),
                      value: customer.account
                        ? t("accountSince", { date: formatDate(customer.account.linkedAt, locale) })
                        : t("accountNone"),
                    },
                    {
                      label: t("marketing"),
                      value: customer.marketing?.subscribed
                        ? t("marketingYes", { date: formatDate(customer.marketing.updatedAt, locale) })
                        : t("marketingNo"),
                    },
                  ]}
                />
              </CardContent>
            </Card>
          </section>

          {!deleted && (customer.addresses ?? []).length > 0 ? (
            <section>
              <Card>
                <CardHeader>
                  <CardTitle asChild>
                    <h2>{t("addresses")}</h2>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3 text-sm">
                    {(customer.addresses ?? []).map((address) => (
                      <li key={address.id} className="text-inksoft">
                        {address.isDefault ? <span className="mb-0.5 block text-xs font-medium text-foreground">{t("defaultAddress")}</span> : null}
                        {[address.name, address.line1, address.line2, address.city, address.region, address.postalCode, countryName(locale, address.country)]
                          .filter(Boolean)
                          .join(", ")}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </section>
          ) : null}

          <section>
            <Card>
              <CardHeader>
                <CardTitle asChild>
                  <h2>{t("notes")}</h2>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {notes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("noNotes")}</p>
                ) : (
                  <ul className="space-y-3">
                    {notes.map((note) => (
                      <li key={note.id} className="rounded-lg border border-border px-3 py-2.5 text-sm">
                        <p className="whitespace-pre-wrap text-foreground">{note.body}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {note.authorName} · {formatDateTime(note.at, locale)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
                <NoteForm storeId={storeId} customerId={customer.id} />
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}
