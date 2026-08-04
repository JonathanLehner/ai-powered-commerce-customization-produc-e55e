import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Breadcrumbs, Callout, DataList, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { getGiftCampaign, getGiftCatalogue, listOrdersForCampaign } from "@/lib/data";
import { countryName } from "@/lib/countries";
import { requireStoreAccess } from "@/lib/session";
import {
  CAMPAIGN_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  type CampaignStatus,
  type OrderStatus,
} from "@/lib/types";
import { CARRIER_LABELS, formatDateTime, formatMoney } from "@/lib/util";

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
  await requireStoreAccess(storeId);

  const campaign = await getGiftCampaign(campaignId);
  if (!campaign || campaign.storeId !== storeId) notFound();

  const [catalogue, orders] = await Promise.all([
    getGiftCatalogue(campaign.catalogueId),
    campaign.status === "ordered" ? listOrdersForCampaign(campaign.id) : Promise.resolve([]),
  ]);
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
          description={`${campaign.recipients.length} recipients for ${catalogue?.companyName ?? "the client"}, ordered by ${campaign.buyer.name} (${campaign.buyer.email}).`}
          actions={
            <>
              <Badge tone={CAMPAIGN_TONES[campaign.status]}>{CAMPAIGN_STATUS_LABELS[campaign.status]}</Badge>
              {campaign.status === "ordered" ? (
                <Link
                  href={`/app/stores/${storeId}/orders?campaign=${encodeURIComponent(campaign.code)}`}
                  className="btn-secondary btn-sm"
                >
                  Filter the order queue
                </Link>
              ) : null}
              {catalogue ? (
                <Link href={`/app/stores/${storeId}/gifting/${catalogue.id}`} className="btn-ghost btn-sm">
                  Gift catalogue
                </Link>
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
        <StatCard
          label="Campaign value"
          value={formatMoney(campaign.totals.total, campaign.currency)}
          sub={
            campaign.payment.status === "succeeded"
              ? `Paid on card ending ${campaign.payment.last4 ?? "••••"}`
              : "Not paid yet"
          }
        />
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
        <section className="card min-w-0 p-5">
          <h2 className="text-base font-semibold text-ink">Recipients</h2>
          {campaign.recipients.length === 0 ? (
            <div className="mt-4">
              <EmptyState title="No recipients" description="This campaign carries no recipient list." />
            </div>
          ) : (
            <div className="mt-4 relative overflow-x-auto">
              <table className="w-full min-w-[48rem] text-left text-sm">
                <thead className="text-xs font-semibold uppercase tracking-wide text-muted">
                  <tr>
                    <th scope="col" className="py-2 pr-3">Recipient</th>
                    <th scope="col" className="py-2 pr-3">Gift</th>
                    <th scope="col" className="py-2 pr-3">Order</th>
                    <th scope="col" className="py-2 pr-3">Fulfilment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {campaign.recipients.map((recipient) => {
                    const order = byRecipient.get(recipient.id) ?? null;
                    return (
                      <tr key={recipient.id} className="align-top">
                        <td className="py-2.5 pr-3">
                          <p className="font-medium text-ink">{recipient.name}</p>
                          <p className="text-xs text-muted">
                            {recipient.city}, {countryName(recipient.country)}
                          </p>
                          {recipient.note ? (
                            <p className="mt-1 text-xs text-inksoft">“{recipient.note}”</p>
                          ) : null}
                        </td>
                        <td className="py-2.5 pr-3">
                          <p className="text-ink">{recipient.productName}</p>
                          <p className="text-xs text-muted">
                            {recipient.variantName || recipient.size} × {recipient.quantity} ·{" "}
                            {formatMoney(recipient.unitPrice * recipient.quantity, campaign.currency)}
                          </p>
                        </td>
                        <td className="py-2.5 pr-3">
                          {order ? (
                            <Link
                              href={`/app/stores/${storeId}/orders/${order.id}`}
                              className="font-medium text-ink hover:underline"
                            >
                              {order.code}
                            </Link>
                          ) : (
                            <span className="text-xs text-muted">Not ordered yet</span>
                          )}
                          {order ? (
                            <p className="mt-1">
                              <Badge tone={ORDER_TONES[order.status]}>{ORDER_STATUS_LABELS[order.status]}</Badge>
                            </p>
                          ) : null}
                        </td>
                        <td className="py-2.5 pr-3">
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
                                  className="text-xs font-medium text-brand-700 hover:underline"
                                >
                                  {CARRIER_LABELS[order.fulfillment.carrier]} {order.fulfillment.trackingNumber} ↗
                                </a>
                              ) : null}
                              {order.fulfillment.exception ? (
                                <p className="mt-1 text-xs text-rose-700">{order.fulfillment.exception}</p>
                              ) : null}
                            </>
                          ) : (
                            <span className="text-xs text-muted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="space-y-6">
          <div className="card p-5">
            <h2 className="text-base font-semibold text-ink">Campaign</h2>
            <DataList
              rows={[
                { label: "Company", value: catalogue?.companyName ?? "—" },
                { label: "Buyer", value: campaign.buyer.name },
                {
                  label: "Spend limit",
                  value:
                    campaign.spendLimitPerRecipient > 0
                      ? `${formatMoney(campaign.spendLimitPerRecipient, campaign.currency)} each`
                      : "No limit",
                },
                {
                  label: "Approval",
                  value: campaign.approval.required
                    ? campaign.approval.decidedBy
                      ? `${campaign.approval.decidedBy}, ${formatDateTime(campaign.approval.decidedAt ?? campaign.updatedAt)}`
                      : `Awaiting ${campaign.approval.approverName || campaign.approval.approverEmail}`
                    : "Not required",
                },
                { label: "Goods", value: formatMoney(campaign.totals.subtotal, campaign.currency) },
                { label: "Delivery", value: formatMoney(campaign.totals.shipping, campaign.currency) },
                { label: "Tax", value: formatMoney(campaign.totals.taxAmount, campaign.currency) },
                { label: "Total", value: formatMoney(campaign.totals.total, campaign.currency) },
              ]}
            />
            {campaign.approval.note ? (
              <p className="mt-3 rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-inksoft">
                “{campaign.approval.note}”
              </p>
            ) : null}
          </div>

          <div className="card p-5">
            <h2 className="text-base font-semibold text-ink">History</h2>
            <ol className="mt-3 divide-y divide-line text-sm">
              {campaign.events.map((entry, index) => (
                <li key={`${entry.at}-${index}`} className="py-2.5">
                  <p className="font-medium text-ink">{entry.status}</p>
                  <p className="text-sm text-inksoft">{entry.note}</p>
                  <p className="text-xs text-muted">
                    {entry.actor} · {formatDateTime(entry.at)}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </div>
    </div>
  );
}
