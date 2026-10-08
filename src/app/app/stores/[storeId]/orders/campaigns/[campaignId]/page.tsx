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
import { countryName } from "@/lib/countries";
import {
  approvalLastSentAt,
  approvalRemindersSent,
  approvalRequestedAt,
  approvalWaitLabel,
  daysAwaitingApproval,
  isApprovalStale,
} from "@/lib/gift-approval";
import { campaignPath, campaignToken } from "@/lib/gift-access";
import { requireStoreAccess, roleCan } from "@/lib/session";
import { ApprovalPanel } from "./ApprovalPanel";
import {
  CAMPAIGN_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  type CampaignStatus,
  type OrderStatus,
} from "@/lib/types";
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

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs
          items={[
            { label: "Orders", href: `/app/stores/${storeId}/orders` },
            { label: campaign.code },
          ]}
        />
        <PageHeader
          title={`${campaign.code} · ${campaign.name}`}
          description={
            viaPlatform
              ? `${campaign.recipients.length} recipients for ${catalogue?.companyName ?? "the client"}. Recipient records stay with the store team.`
              : `${campaign.recipients.length} recipients for ${catalogue?.companyName ?? "the client"}, ordered by ${campaign.buyer.name} (${campaign.buyer.email}).`
          }
          actions={
            <>
              <Badge tone={CAMPAIGN_TONES[campaign.status]}>{CAMPAIGN_STATUS_LABELS[campaign.status]}</Badge>
              {campaign.status === "ordered" ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/app/stores/${storeId}/orders?campaign=${encodeURIComponent(campaign.code)}`}>
                    Filter the order queue
                  </Link>
                </Button>
              ) : null}
              {catalogue && !viaPlatform ? (
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/app/stores/${storeId}/gifting/${catalogue.id}`}>Gift catalogue</Link>
                </Button>
              ) : null}
            </>
          }
        />
      </div>

      {exceptions.length > 0 ? (
        <Callout tone="rose" title={`${exceptions.length} of ${orders.length} gifts need attention`}>
          Work them from the rows below — each one opens its own order, where routing, tracking and refunds behave
          exactly as they do for a shopper order.
        </Callout>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {viaPlatform ? (
          <StatCard
            label="Payment"
            value={campaign.payment.status === "succeeded" ? "Paid" : "Not paid"}
            sub="Values stay with the store team"
          />
        ) : (
          <StatCard
            label="Campaign value"
            value={formatMoney(campaign.totals.total, campaign.currency)}
            sub={
              campaign.payment.status === "succeeded"
                ? `Paid on card ending ${campaign.payment.last4 ?? "••••"}`
                : "Not paid yet"
            }
          />
        )}
        <StatCard label="Orders raised" value={String(orders.length)} sub={`${campaign.recipients.length} recipients`} />
        <StatCard label="Shipped" value={String(shipped)} sub={`${delivered} delivered`} />
        <StatCard
          label="Needs attention"
          value={String(exceptions.length)}
          tone={exceptions.length > 0 ? "rose" : "green"}
          sub="Exceptions and manual routing"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card asChild className="min-w-0">
        <section>
          <CardHeader>
            <CardTitle asChild>
              <h2>{viaPlatform ? "Gift orders" : "Recipients"}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
          {viaPlatform ? (
            // Recipients are named employees of the client. Platform access sees
            // the jobs the campaign raised, not who each one is going to.
            orders.length === 0 ? (
              <EmptyState
                title="No orders raised"
                description="Orders appear once the campaign is approved and paid."
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
                        {order.fulfillment.supplierName ?? "No supplier"} ·{" "}
                        {order.fulfillment.routing === "manual_required" ? "manual required" : order.fulfillment.routing}
                      </span>
                      {order.fulfillment.exception ? (
                        <span className="block text-xs text-rose-700">Fulfilment exception raised</span>
                      ) : null}
                    </span>
                    <Badge tone={ORDER_TONES[order.status]}>{ORDER_STATUS_LABELS[order.status]}</Badge>
                  </li>
                ))}
              </ul>
            )
          ) : campaign.recipients.length === 0 ? (
            <EmptyState title="No recipients" description="This campaign carries no recipient list." />
          ) : (
            <div className="relative overflow-x-auto">
              <Table className="min-w-[48rem]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={TH}>Recipient</TableHead>
                    <TableHead className={TH}>Gift</TableHead>
                    <TableHead className={TH}>Order</TableHead>
                    <TableHead className={TH}>Fulfilment</TableHead>
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
                            {recipient.city}, {countryName(recipient.country)}
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
                              {formatMoney(recipient.unitPrice * recipient.quantity, campaign.currency)}
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
                            <span className="text-xs text-muted-foreground">Not ordered yet</span>
                          )}
                          {order ? (
                            <p className="mt-1">
                              <Badge tone={ORDER_TONES[order.status]}>
                                {ORDER_STATUS_LABELS[order.status]}
                              </Badge>
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="px-0 py-2.5 align-top whitespace-normal">
                          {order ? (
                            <>
                              <p className="text-xs text-inksoft">
                                {order.fulfillment.supplierName ?? "No supplier"} ·{" "}
                                {order.fulfillment.routing === "manual_required"
                                  ? "manual required"
                                  : order.fulfillment.routing}
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
                            <span className="text-xs text-muted-foreground">—</span>
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
              waitLabel={approvalWaitLabel(approval.days)}
              requestedAt={formatDate(approvalRequestedAt(campaign))}
              lastSentAt={formatDateTime(approvalLastSentAt(campaign))}
              reminders={approvalRemindersSent(campaign)}
              stale={isApprovalStale(campaign)}
              canManage={roleCan(role, "store.gifting")}
            />
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle asChild>
                <h2>Campaign</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
            <DataList
              rows={[
                { label: "Company", value: catalogue?.companyName ?? "—" },
                ...(viaPlatform
                  ? []
                  : [
                      { label: "Buyer", value: campaign.buyer.name },
                      {
                        label: "Spend limit",
                        value:
                          campaign.spendLimitPerRecipient > 0
                            ? `${formatMoney(campaign.spendLimitPerRecipient, campaign.currency)} each`
                            : "No limit",
                      },
                    ]),
                {
                  label: "Approval",
                  value: viaPlatform
                    ? campaign.approval.required
                      ? campaign.approval.decidedBy
                        ? "Decided"
                        : "Awaiting approval"
                      : "Not required"
                    : campaign.approval.required
                    ? campaign.approval.decidedBy
                      ? `${campaign.approval.decidedBy}, ${formatDateTime(campaign.approval.decidedAt ?? campaign.updatedAt)}`
                      : `Awaiting ${campaign.approval.approverName || campaign.approval.approverEmail} · ${approvalWaitLabel(daysAwaitingApproval(campaign)).toLowerCase()}`
                    : "Not required",
                },
                ...(viaPlatform
                  ? []
                  : [
                      { label: "Goods", value: formatMoney(campaign.totals.subtotal, campaign.currency) },
                      { label: "Delivery", value: formatMoney(campaign.totals.shipping, campaign.currency) },
                      { label: "Tax", value: formatMoney(campaign.totals.taxAmount, campaign.currency) },
                      { label: "Total", value: formatMoney(campaign.totals.total, campaign.currency) },
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
                <h2>History</h2>
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
                    {formatDateTime(entry.at)}
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
