import { getLocale, getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import Link from "next/link";
import { StoreWorkspaceNotFoundView } from "@/components/NotFoundViews";
import { Badge, Breadcrumbs, Callout, DataList, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getGiftCampaign, getGiftCatalogue, listOrdersForCampaign } from "@/lib/data";
import { countryName } from "@/i18n/display";
import {
  approvalLastSentAt,
  approvalRemindersSent,
  approvalRequestedAt,
  daysAwaitingApproval,
  isApprovalStale,
} from "@/lib/gift-approval";
import { campaignPath, campaignToken } from "@/lib/gift-access";
import { requireStoreAccess, roleCan } from "@/lib/session";
import { ApprovalPanel } from "./ApprovalPanel";
import type { CampaignStatus, OrderStatus } from "@/lib/types";
import { CARRIER_LABELS, formatDate, formatDateTime, formatMoney } from "@/lib/util";

/** The column-head style every table in the workspace shares. */
const TH = "px-0 text-xs font-semibold tracking-wide uppercase text-muted-foreground";

const CAMPAIGN_TONES: Record<CampaignStatus, "amber" | "brand" | "green" | "rose" | "slate"> = {
  awaiting_approval: "amber",
  approved: "brand",
  declined: "rose",
  ordered: "green",
  cancelled: "slate",
};

const ORDER_TONES: Record<OrderStatus, "green" | "amber" | "rose" | "brand" | "slate"> = {
  awaiting_payment: "slate",
  paid: "brand",
  in_production: "amber",
  shipped: "brand",
  delivered: "green",
  cancelled: "slate",
  exception: "rose",
};

export default async function CampaignFulfilmentPage({
  params,
}: {
  params: Promise<{ storeId: string; campaignId: string }>;
}) {
  const { storeId, campaignId } = await params;
  const { role, viaPlatform } = await requireStoreAccess(storeId);

  const campaign = await getGiftCampaign(campaignId);
  if (!campaign || campaign.storeId !== storeId)
    return <StoreWorkspaceNotFoundView base={`/app/stores/${storeId}`} />;

  const [catalogue, orders] = await Promise.all([
    getGiftCatalogue(campaign.catalogueId),
    campaign.status === "ordered" ? listOrdersForCampaign(campaign.id) : Promise.resolve([]),
  ]);

  /*
   * The approval panel: who the campaign is with, how long it has been there,
   * their own link and the two ways out of a stuck campaign. Recipient records
   * and the people around them stay with the store team, so platform access
   * reads the approval as a state and nothing more.
   */
  const awaiting = campaign.approval.required && campaign.status === "awaiting_approval";
  const approval =
    awaiting && catalogue && !viaPlatform
      ? await (async () => {
          const headerList = await headers();
          const host = headerList.get("host") ?? "";
          const proto =
            headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
          const token = await campaignToken(campaign.id, "approver");
          return {
            link: `${host ? `${proto}://${host}` : ""}${campaignPath(catalogue.slug, campaign.code, token, "approver")}`,
            days: daysAwaitingApproval(campaign),
          };
        })()
      : null;
  const byRecipient = new Map(orders.map((order) => [order.campaign?.recipientId ?? "", order]));

  const exceptions = orders.filter(
    (order) => order.status === "exception" || order.fulfillment.routing === "manual_required",
  );
  const delivered = orders.filter((order) => order.status === "delivered").length;
  const shipped = orders.filter((order) => order.status === "shipped").length;

  const [t, labels, ordersT, locale] = await Promise.all([
    getTranslations("campaign"),
    getTranslations("labels"),
    getTranslations("orders"),
    getLocale(),
  ]);
  const money = (minor: number) => formatMoney(minor, campaign.currency, locale);
  const when = (iso: string) => formatDateTime(iso, locale);
  const wait = (days: number) => (days <= 0 ? t("sentToday") : t("waiting", { days }));
  const waitLower = (days: number) => (days <= 0 ? t("sentTodayLower") : t("waitingLower", { days }));
  const company = catalogue?.companyName ?? t("theClient");

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs
          items={[
            { label: t("orders"), href: `/app/stores/${storeId}/orders` },
            { label: campaign.code },
          ]}
        />
        <PageHeader
          title={`${campaign.code} · ${campaign.name}`}
          description={
            viaPlatform
              ? t("recipientsFor", { count: campaign.recipients.length, company })
              : t("recipientsForBy", {
                  count: campaign.recipients.length,
                  company,
                  buyer: campaign.buyer.name,
                  email: campaign.buyer.email,
                })
          }
          actions={
            <>
              <Badge tone={CAMPAIGN_TONES[campaign.status]}>{labels(`campaignStatus.${campaign.status}`)}</Badge>
              {campaign.status === "ordered" ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/app/stores/${storeId}/orders?campaign=${encodeURIComponent(campaign.code)}`}>
                    {t("viewOrders")}
                  </Link>
                </Button>
              ) : null}
              {catalogue && !viaPlatform ? (
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/app/stores/${storeId}/gifting/${catalogue.id}`}>{t("giftCatalogue")}</Link>
                </Button>
              ) : null}
            </>
          }
        />
      </div>

      {exceptions.length > 0 ? (
        <Callout tone="rose" title={t("needAttention", { count: exceptions.length, total: orders.length })}>
          {t("openEach")}
        </Callout>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {viaPlatform ? (
          <StatCard
            label={t("payment")}
            value={campaign.payment.status === "succeeded" ? t("paid") : t("notPaid")}
          />
        ) : (
          <StatCard
            label={t("value")}
            value={money(campaign.totals.total)}
            sub={
              campaign.payment.status === "succeeded"
                ? t("paidCard", { last4: campaign.payment.last4 ?? "••••" })
                : t("notPaidYet")
            }
          />
        )}
        <StatCard
          label={t("ordersRaised")}
          value={String(orders.length)}
          sub={t("recipients", { count: campaign.recipients.length })}
        />
        <StatCard label={t("shipped")} value={String(shipped)} sub={t("delivered", { count: delivered })} />
        <StatCard
          label={t("attention")}
          value={String(exceptions.length)}
          tone={exceptions.length > 0 ? "rose" : "green"}
          sub={t("attentionSub")}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card asChild className="min-w-0">
        <section>
          <CardHeader>
            <CardTitle asChild>
              <h2>{viaPlatform ? t("giftOrders") : t("recipientsTitle")}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
          {viaPlatform ? (
            // Recipients are named employees of the client. Platform access sees
            // the jobs the campaign raised, not who each one is going to.
            orders.length === 0 ? (
              <EmptyState
                title={t("noOrders")}
                description={t("noOrdersBody")}
              />
            ) : (
              <ul className="divide-y divide-border text-sm">
                {orders.map((order) => (
                  <li key={order.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
                    <span className="min-w-0">
                      <Link
                        href={`/app/stores/${storeId}/orders/${order.id}`}
                        className="font-medium text-ink hover:underline"
                      >
                        {order.code}
                      </Link>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {order.fulfillment.supplierName ?? ordersT("noSupplier")} ·{" "}
                        {ordersT(`routing.${order.fulfillment.routing}`)}
                      </span>
                      {order.fulfillment.exception ? (
                        <span className="block text-xs text-rose-700">{ordersT("exceptionRaised")}</span>
                      ) : null}
                    </span>
                    <Badge tone={ORDER_TONES[order.status]}>{labels(`orderStatus.${order.status}`)}</Badge>
                  </li>
                ))}
              </ul>
            )
          ) : campaign.recipients.length === 0 ? (
            <EmptyState title={t("noRecipients")} description={t("noRecipientsBody")} />
          ) : (
            <div className="relative overflow-x-auto">
              <Table className="min-w-[48rem]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={TH}>{t("colRecipient")}</TableHead>
                    <TableHead className={TH}>{t("colGift")}</TableHead>
                    <TableHead className={TH}>{t("colOrder")}</TableHead>
                    <TableHead className={TH}>{t("colFulfilment")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaign.recipients.map((recipient) => {
                    const order = byRecipient.get(recipient.id) ?? null;
                    return (
                      <TableRow key={recipient.id} className="hover:bg-transparent">
                        <TableCell className="px-0 py-2.5 align-top whitespace-normal">
                          <p className="font-medium text-foreground">{recipient.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {recipient.city}, {countryName(locale, recipient.country)}
                          </p>
                          {recipient.note ? (
                            <p className="mt-1 text-xs text-inksoft">“{recipient.note}”</p>
                          ) : null}
                        </TableCell>
                        <TableCell className="px-0 py-2.5 align-top whitespace-normal">
                          <p className="text-foreground">{recipient.productName}</p>
                          <p className="text-xs text-muted-foreground">
                            {recipient.variantName || recipient.size} ×{" "}
                            <span className="tabular-nums">{recipient.quantity}</span> ·{" "}
                            <span className="tabular-nums">
                              {money(recipient.unitPrice * recipient.quantity)}
                            </span>
                          </p>
                        </TableCell>
                        <TableCell className="px-0 py-2.5 align-top whitespace-normal">
                          {order ? (
                            <Link
                              href={`/app/stores/${storeId}/orders/${order.id}`}
                              className="font-medium text-foreground hover:underline"
                            >
                              {order.code}
                            </Link>
                          ) : (
                            <span className="text-xs text-muted-foreground">{t("notOrdered")}</span>
                          )}
                          {order ? (
                            <p className="mt-1">
                              <Badge tone={ORDER_TONES[order.status]}>
                                {labels(`orderStatus.${order.status}`)}
                              </Badge>
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="px-0 py-2.5 align-top whitespace-normal">
                          {order ? (
                            <>
                              <p className="text-xs text-inksoft">
                                {order.fulfillment.supplierName ?? ordersT("noSupplier")} ·{" "}
                                {ordersT(`routing.${order.fulfillment.routing}`)}
                              </p>
                              {order.fulfillment.trackingNumber && order.fulfillment.carrier ? (
                                <a
                                  href={order.fulfillment.trackingUrl ?? "#"}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs font-medium text-primary hover:underline"
                                >
                                  {CARRIER_LABELS[order.fulfillment.carrier]}{" "}
                                  {order.fulfillment.trackingNumber} ↗
                                </a>
                              ) : null}
                              {order.fulfillment.exception ? (
                                <p className="mt-1 text-xs text-rose-700">{order.fulfillment.exception}</p>
                              ) : null}
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">{labels("none")}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          </CardContent>
        </section>
        </Card>

        <section className="space-y-6">
          {approval ? (
            <ApprovalPanel
              storeId={storeId}
              campaignId={campaign.id}
              campaignCode={campaign.code}
              approverName={campaign.approval.approverName}
              approverEmail={campaign.approval.approverEmail}
              approvalLink={approval.link}
              waitLabel={wait(approval.days)}
              waitDays={approval.days}
              requestedAt={formatDate(approvalRequestedAt(campaign), locale)}
              lastSentAt={when(approvalLastSentAt(campaign))}
              reminders={approvalRemindersSent(campaign)}
              stale={isApprovalStale(campaign)}
              canManage={roleCan(role, "store.gifting")}
            />
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle asChild>
                <h2>{t("campaign")}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
            <DataList
              rows={[
                { label: t("company"), value: catalogue?.companyName ?? labels("notSet") },
                ...(viaPlatform
                  ? []
                  : [
                      { label: t("buyer"), value: campaign.buyer.name },
                      {
                        label: t("spendLimit"),
                        value:
                          campaign.spendLimitPerRecipient > 0
                            ? t("each", { amount: money(campaign.spendLimitPerRecipient) })
                            : t("noLimit"),
                      },
                    ]),
                {
                  label: t("approval"),
                  value: viaPlatform
                    ? campaign.approval.required
                      ? campaign.approval.decidedBy
                        ? t("decided")
                        : t("awaitingApproval")
                      : t("notRequired")
                    : campaign.approval.required
                    ? campaign.approval.decidedBy
                      ? `${campaign.approval.decidedBy}, ${when(campaign.approval.decidedAt ?? campaign.updatedAt)}`
                      : t("awaiting", {
                          approver: campaign.approval.approverName || campaign.approval.approverEmail,
                          wait: waitLower(daysAwaitingApproval(campaign)),
                        })
                    : t("notRequired"),
                },
                ...(viaPlatform
                  ? []
                  : [
                      { label: t("goods"), value: money(campaign.totals.subtotal) },
                      { label: t("delivery"), value: money(campaign.totals.shipping) },
                      { label: t("tax"), value: money(campaign.totals.taxAmount) },
                      { label: t("total"), value: money(campaign.totals.total) },
                    ]),
              ]}
            />
            {campaign.approval.note && !viaPlatform ? (
              <p className="mt-3 rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-inksoft">
                “{campaign.approval.note}”
              </p>
            ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle asChild>
                <h2>{t("history")}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
            <ol className="divide-y divide-border text-sm">
              {campaign.events.map((entry, index) => (
                <li key={`${entry.at}-${index}`} className="py-2.5">
                  <p className="font-medium text-foreground">{entry.status}</p>
                  {viaPlatform ? null : <p className="text-sm text-inksoft">{entry.note}</p>}
                  {/* The buyer and the approver act under their own names, so
                      platform access reads the step and when, not who. */}
                  <p className="text-xs text-muted-foreground">
                    {viaPlatform ? "" : `${entry.actor} · `}
                    {when(entry.at)}
                  </p>
                </li>
              ))}
            </ol>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
