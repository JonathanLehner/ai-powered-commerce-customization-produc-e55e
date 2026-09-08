import type { Metadata } from "next";
import Link from "next/link";
import { GiftPortalNotFoundView, UnknownGiftPortalView } from "@/components/NotFoundViews";
import { Badge, Callout } from "@/components/ui";
import { countryName } from "@/lib/countries";
import { getGiftCampaignByCode, getGiftCatalogueBySlug, getStore } from "@/lib/data";
import { verifyCampaignToken } from "@/lib/gift-access";
import { orderStatusUrl, signOrderToken } from "@/lib/order-access";
import { CAMPAIGN_STATUS_LABELS, type CampaignStatus } from "@/lib/types";
import { formatDateTime, formatMoney } from "@/lib/util";
import { ApprovalForm, CancelCampaignForm, PaymentForm } from "./CampaignForms";

export const metadata: Metadata = {
  title: "Gift campaign",
  robots: { index: false, follow: false },
};

const TONES: Record<CampaignStatus, "amber" | "brand" | "green" | "rose" | "slate"> = {
  awaiting_approval: "amber",
  approved: "brand",
  declined: "rose",
  ordered: "green",
  cancelled: "slate",
};

export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; code: string }>;
  searchParams: Promise<{ t?: string; a?: string }>;
}) {
  const { slug, code } = await params;
  const { t, a } = await searchParams;

  const catalogue = await getGiftCatalogueBySlug(slug);
  if (!catalogue) return <UnknownGiftPortalView slug={slug} />;
  const [store, campaign] = await Promise.all([
    getStore(catalogue.storeId),
    getGiftCampaignByCode(decodeURIComponent(code).toUpperCase()),
  ]);
  // The catalogue is real but this campaign code is not: stay inside the
  // portal's own chrome and point back at the catalogue.
  if (!store || !campaign || campaign.catalogueId !== catalogue.id)
    return <GiftPortalNotFoundView catalogue={catalogue} />;

  const [isBuyer, isApprover] = await Promise.all([
    verifyCampaignToken(campaign.id, "buyer", t),
    verifyCampaignToken(campaign.id, "approver", a),
  ]);

  if (!isBuyer && !isApprover) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-14 sm:px-6">
        <div className="card p-6">
          <h1 className="text-lg font-semibold tracking-tight text-ink">This campaign link is not valid</h1>
          <p className="mt-2 text-sm text-muted">
            Campaign links are personal: one for the buyer, one for the approver. Ask for yours to be sent again,
            or open the catalogue and start a new order.
          </p>
          <Link href={`/g/${slug}`} className="btn-secondary btn-sm mt-5 inline-flex">
            Back to the catalogue
          </Link>
        </div>
      </div>
    );
  }

  // The buyer can follow each gift on the same order page a shopper uses.
  const orderLinks = new Map(
    await Promise.all(
      campaign.recipients
        .filter((recipient) => recipient.orderCode)
        .map(
          async (recipient) =>
            [
              recipient.id,
              orderStatusUrl(
                store.slug,
                recipient.orderCode as string,
                await signOrderToken(store.id, recipient.orderCode as string),
              ),
            ] as const,
        ),
    ),
  );

  const payable =
    isBuyer &&
    campaign.status === "approved" &&
    store.status === "active" &&
    store.stripe.connected &&
    store.stripe.chargesEnabled;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <Link href={`/g/${slug}`} className="text-sm font-medium text-brand-700 hover:underline">
        ← {catalogue.name}
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            {campaign.code} · {campaign.name}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {campaign.recipients.length} recipients · submitted by {campaign.buyer.name} on{" "}
            {formatDateTime(campaign.createdAt)}
          </p>
        </div>
        <Badge tone={TONES[campaign.status]}>{CAMPAIGN_STATUS_LABELS[campaign.status]}</Badge>
      </div>

      {campaign.status === "awaiting_approval" && !isApprover ? (
        <div className="mt-6">
          <Callout tone="amber" title="Waiting for approval">
            {campaign.approval.approverName || campaign.approval.approverEmail} has the list and its total. You can
            pay as soon as they approve it — nothing has been charged.
          </Callout>
        </div>
      ) : null}

      {isApprover && campaign.approval.decidedAt ? (
        <div className="mt-6">
          <Callout tone={campaign.status === "declined" ? "rose" : "green"} title="Your decision is recorded">
            {campaign.status === "declined" ? "Declined" : "Approved"} by {campaign.approval.decidedBy} on{" "}
            {formatDateTime(campaign.approval.decidedAt)}.{" "}
            {campaign.status === "approved"
              ? `${campaign.buyer.name} can now pay for it — nothing has been charged to you.`
              : ""}
          </Callout>
        </div>
      ) : null}

      {campaign.status === "declined" ? (
        <div className="mt-6">
          <Callout tone="rose" title="Declined">
            {campaign.approval.note ?? "No reason was given."} Start a new order from the catalogue with the
            changes your approver asked for.
          </Callout>
        </div>
      ) : null}

      {campaign.status === "ordered" ? (
        <div className="mt-6">
          <Callout tone="green" title="Paid and in production">
            {campaign.recipients.length} orders were raised, one per recipient, each with its own delivery and
            tracking. Follow any of them below.
          </Callout>
        </div>
      ) : null}

      {campaign.status === "approved" && !payable && isBuyer ? (
        <div className="mt-6">
          <Callout tone="amber" title="Approved, but the store cannot take payment yet">
            {store.clientName} has not finished connecting their payment account. Your campaign is saved and can
            be paid for as soon as they have.
          </Callout>
        </div>
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="min-w-0">
          <h2 className="text-base font-semibold text-ink">Recipients</h2>
          <div className="mt-3 card relative overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="bg-canvas text-xs font-semibold uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3">Recipient</th>
                  <th scope="col" className="px-4 py-3">Gift</th>
                  <th scope="col" className="px-4 py-3">Delivery</th>
                  <th scope="col" className="px-4 py-3 text-right">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {campaign.recipients.map((recipient) => (
                  <tr key={recipient.id} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{recipient.name}</p>
                      <p className="text-xs text-muted">{recipient.email}</p>
                      {recipient.note ? (
                        <p className="mt-1 text-xs text-inksoft">“{recipient.note}”</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-inksoft">
                      {recipient.productName}
                      <span className="block text-xs text-muted">
                        {recipient.variantName || recipient.size}
                        {recipient.quantity > 1 ? ` × ${recipient.quantity}` : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {recipient.line1}, {recipient.city} {recipient.postalCode}
                      <span className="block">{countryName(recipient.country)}</span>
                      {orderLinks.get(recipient.id) ? (
                        <Link
                          href={orderLinks.get(recipient.id) as string}
                          className="mt-1 inline-block font-medium text-brand-700 hover:underline"
                        >
                          Track {recipient.orderCode}
                        </Link>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink">
                      {formatMoney(recipient.unitPrice * recipient.quantity, campaign.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="mt-8 text-base font-semibold text-ink">History</h2>
          <ol className="mt-3 card divide-y divide-line p-5 text-sm">
            {campaign.events.map((entry, index) => (
              <li key={`${entry.at}-${index}`} className="py-2.5 first:pt-0 last:pb-0">
                <p className="font-medium text-ink">{entry.status}</p>
                <p className="text-inksoft">{entry.note}</p>
                <p className="text-xs text-muted">
                  {entry.actor} · {formatDateTime(entry.at)}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <aside className="space-y-6">
          <div className="h-fit rounded-xl border border-line bg-canvas p-5">
            <h2 className="text-base font-semibold text-ink">Campaign total</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Gifts</dt>
                <dd className="tabular-nums text-ink">
                  {formatMoney(campaign.totals.subtotal, campaign.currency)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Delivery</dt>
                <dd className="tabular-nums text-ink">
                  {formatMoney(campaign.totals.shipping, campaign.currency)}
                </dd>
              </div>
              {campaign.totals.taxLines.map((row) => (
                <div key={row.rate} className="flex justify-between">
                  <dt className="text-muted">Tax {row.rate}%</dt>
                  <dd className="tabular-nums text-ink">{formatMoney(row.amount, campaign.currency)}</dd>
                </div>
              ))}
              <div className="flex justify-between border-t border-line pt-2">
                <dt className="font-semibold text-ink">Total</dt>
                <dd className="text-base font-semibold tabular-nums text-ink">
                  {formatMoney(campaign.totals.total, campaign.currency)}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-muted">
              {campaign.spendLimitPerRecipient > 0
                ? `Spend limit ${formatMoney(campaign.spendLimitPerRecipient, campaign.currency)} per recipient.`
                : "No spend limit on this programme."}
            </p>
          </div>

          {isApprover && campaign.status === "awaiting_approval" ? (
            <div className="card p-5">
              <h2 className="text-base font-semibold text-ink">Your decision</h2>
              <div className="mt-3">
                <ApprovalForm
                  slug={slug}
                  code={campaign.code}
                  token={a as string}
                  buyerName={campaign.buyer.name}
                  total={formatMoney(campaign.totals.total, campaign.currency)}
                />
              </div>
            </div>
          ) : null}

          {payable ? (
            <div className="card p-5">
              <h2 className="text-base font-semibold text-ink">Payment</h2>
              <div className="mt-3">
                <PaymentForm
                  slug={slug}
                  code={campaign.code}
                  token={t as string}
                  total={formatMoney(campaign.totals.total, campaign.currency)}
                  stripeAccountId={store.stripe.accountId}
                />
              </div>
            </div>
          ) : null}

          {isBuyer && (campaign.status === "awaiting_approval" || campaign.status === "approved") ? (
            <CancelCampaignForm slug={slug} code={campaign.code} token={t as string} />
          ) : null}
        </aside>
      </div>
    </div>
  );
}
