import type { Metadata } from "next";
import Link from "next/link";
import { GiftPortalNotFoundView, UnknownGiftPortalView } from "@/components/NotFoundViews";
import { Badge, Callout } from "@/components/ui";
import { localCountryName } from "@/lib/countries";
import { getGiftCampaignByCode, getGiftCatalogueBySlug, getStore } from "@/lib/data";
import { verifyCampaignToken } from "@/lib/gift-access";
import { fmt, storefrontLocale, type StorefrontCopy } from "@/lib/i18n";
import { orderStatusUrl, signOrderToken } from "@/lib/order-access";
import type { CampaignStatus } from "@/lib/types";
import { ApprovalForm, CancelCampaignForm, PaymentForm } from "./CampaignForms";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

/** The tab title is the store's too, so it is resolved per catalogue. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const catalogue = await getGiftCatalogueBySlug(slug);
  const store = catalogue ? await getStore(catalogue.storeId) : null;
  return {
    title: store ? storefrontLocale(store).t.gift.campaignTitle : "Gift campaign",
    robots: { index: false, follow: false },
  };
}

/** The campaign's own status, in the store's language. */
const STATUS_LABELS: Record<CampaignStatus, keyof StorefrontCopy["gift"]> = {
  awaiting_approval: "statusAwaitingApproval",
  approved: "statusApproved",
  declined: "statusDeclined",
  ordered: "statusOrdered",
  cancelled: "statusCancelled",
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
  // Renamed off `t`/`a`: `t` is the store's copy dictionary on this page.
  const { t: buyerToken, a: approverToken } = await searchParams;

  const catalogue = await getGiftCatalogueBySlug(slug);
  if (!catalogue) return <UnknownGiftPortalView slug={slug} />;
  const [store, campaign] = await Promise.all([
    getStore(catalogue.storeId),
    getGiftCampaignByCode(decodeURIComponent(code).toUpperCase()),
  ]);
  // The catalogue is real but this campaign code is not: stay inside the
  // portal's own chrome and point back at the catalogue.
  if (!store || !campaign || campaign.catalogueId !== catalogue.id)
    return <GiftPortalNotFoundView catalogue={catalogue} store={store} />;

  const { t, tag, money, dateTime } = storefrontLocale(store);

  const [isBuyer, isApprover] = await Promise.all([
    verifyCampaignToken(campaign.id, "buyer", buyerToken),
    verifyCampaignToken(campaign.id, "approver", approverToken),
  ]);

  if (!isBuyer && !isApprover) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-14 sm:px-6">
        <Card className="block overflow-visible p-6">
          <h1 className="text-lg font-semibold tracking-tight text-ink">{t.gift.linkInvalidTitle}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t.gift.linkInvalidBody}</p>
          <Link href={`/g/${slug}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-5 inline-flex")}>
            {t.gift.backToCatalogue}
          </Link>
        </Card>
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
          <p className="mt-1 text-sm text-muted-foreground">
            {fmt(t.gift.campaignSubmitted, {
              count: campaign.recipients.length,
              buyer: campaign.buyer.name,
              when: dateTime(campaign.createdAt),
            })}
          </p>
        </div>
        <Badge tone={TONES[campaign.status]}>{t.gift[STATUS_LABELS[campaign.status]]}</Badge>
      </div>

      {campaign.status === "awaiting_approval" && !isApprover ? (
        <div className="mt-6">
          <Callout tone="amber" title={t.gift.waitingTitle}>
            {fmt(t.gift.waitingBody, {
              approver: campaign.approval.approverName || campaign.approval.approverEmail,
            })}
          </Callout>
        </div>
      ) : null}

      {isApprover && campaign.approval.decidedAt ? (
        <div className="mt-6">
          <Callout tone={campaign.status === "declined" ? "rose" : "green"} title={t.gift.decisionTitle}>
            {fmt(t.gift.decisionBody, {
              decision: campaign.status === "declined" ? t.gift.decisionDeclined : t.gift.decisionApproved,
              who: campaign.approval.decidedBy ?? campaign.approval.approverName,
              when: dateTime(campaign.approval.decidedAt),
            })}{" "}
            {campaign.status === "approved"
              ? fmt(t.gift.decisionCanPay, { buyer: campaign.buyer.name })
              : ""}
          </Callout>
        </div>
      ) : null}

      {campaign.status === "declined" ? (
        <div className="mt-6">
          <Callout tone="rose" title={t.gift.decisionDeclined}>
            {campaign.approval.note ?? t.gift.declinedNoReason} {t.gift.declinedBody}
          </Callout>
        </div>
      ) : null}

      {campaign.status === "ordered" ? (
        <div className="mt-6">
          <Callout tone="green" title={t.gift.orderedTitle}>
            {fmt(t.gift.orderedBody, { count: campaign.recipients.length })}
          </Callout>
        </div>
      ) : null}

      {campaign.status === "approved" && !payable && isBuyer ? (
        <div className="mt-6">
          <Callout tone="amber" title={t.gift.unpayableTitle}>
            {fmt(t.gift.unpayableBody, { client: store.clientName })}
          </Callout>
        </div>
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="min-w-0">
          <h2 className="text-base font-semibold text-ink">{t.gift.recipientsTitle}</h2>
          <Card className="relative mt-3 block overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="bg-canvas text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3">{t.gift.columnRecipient}</th>
                  <th scope="col" className="px-4 py-3">{t.gift.columnGift}</th>
                  <th scope="col" className="px-4 py-3">{t.gift.columnDelivery}</th>
                  <th scope="col" className="px-4 py-3 text-right">{t.gift.columnValue}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {campaign.recipients.map((recipient) => (
                  <tr key={recipient.id} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{recipient.name}</p>
                      <p className="text-xs text-muted-foreground">{recipient.email}</p>
                      {recipient.note ? (
                        <p className="mt-1 text-xs text-inksoft">“{recipient.note}”</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-inksoft">
                      {recipient.productName}
                      <span className="block text-xs text-muted-foreground">
                        {recipient.variantName || recipient.size}
                        {recipient.quantity > 1 ? ` × ${recipient.quantity}` : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {recipient.line1}, {recipient.city} {recipient.postalCode}
                      <span className="block">{localCountryName(recipient.country, tag)}</span>
                      {orderLinks.get(recipient.id) ? (
                        <Link
                          href={orderLinks.get(recipient.id) as string}
                          className="mt-1 inline-block font-medium text-brand-700 hover:underline"
                        >
                          {fmt(t.gift.track, { code: recipient.orderCode as string })}
                        </Link>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink">
                      {money(recipient.unitPrice * recipient.quantity, campaign.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
          </table>
          </Card>

          <h2 className="mt-8 text-base font-semibold text-ink">{t.gift.historyTitle}</h2>
          <Card asChild className="mt-3 block overflow-visible p-5 text-sm">
          <ol className="divide-y divide-line">
              {campaign.events.map((entry, index) => (
                <li key={`${entry.at}-${index}`} className="py-2.5 first:pt-0 last:pb-0">
                  <p className="font-medium text-ink">{entry.status}</p>
                  <p className="text-inksoft">{entry.note}</p>
                  <p className="text-xs text-muted-foreground">
                    {entry.actor} · {dateTime(entry.at)}
                  </p>
                </li>
              ))}
          </ol>
          </Card>
        </section>

        <aside className="space-y-6">
          <div className="h-fit rounded-xl border border-line bg-canvas p-5">
            <h2 className="text-base font-semibold text-ink">{t.gift.totalsTitle}</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t.gift.subtotal}</dt>
                <dd className="tabular-nums text-ink">
                  {money(campaign.totals.subtotal, campaign.currency)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t.gift.shipping}</dt>
                <dd className="tabular-nums text-ink">
                  {money(campaign.totals.shipping, campaign.currency)}
                </dd>
              </div>
              {campaign.totals.taxLines.map((row) => (
                <div key={row.rate} className="flex justify-between">
                  <dt className="text-muted-foreground">{fmt(t.gift.taxRow, { rate: row.rate })}</dt>
                  <dd className="tabular-nums text-ink">{money(row.amount, campaign.currency)}</dd>
                </div>
              ))}
              <div className="flex justify-between border-t border-line pt-2">
                <dt className="font-semibold text-ink">{t.gift.total}</dt>
                <dd className="text-base font-semibold tabular-nums text-ink">
                  {money(campaign.totals.total, campaign.currency)}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              {campaign.spendLimitPerRecipient > 0
                ? fmt(t.gift.spendLimitNote, {
                    amount: money(campaign.spendLimitPerRecipient, campaign.currency),
                  })
                : t.gift.noSpendLimitNote}
            </p>
          </div>

          {isApprover && campaign.status === "awaiting_approval" ? (
            <Card className="block overflow-visible p-5">
              <h2 className="text-base font-semibold text-ink">{t.gift.decisionFormTitle}</h2>
              <div className="mt-3">
                <ApprovalForm
                  slug={slug}
                  code={campaign.code}
                  token={approverToken as string}
                  buyerName={campaign.buyer.name}
                  total={money(campaign.totals.total, campaign.currency)}
                  t={t.gift}
                />
            </div>
            </Card>
          ) : null}

          {payable ? (
            <Card className="block overflow-visible p-5">
              <h2 className="text-base font-semibold text-ink">{t.gift.paymentTitle}</h2>
              <div className="mt-3">
                <PaymentForm
                  slug={slug}
                  code={campaign.code}
                  token={buyerToken as string}
                  total={money(campaign.totals.total, campaign.currency)}
                  stripeAccountId={store.stripe.accountId}
                  t={t.gift}
                  card={t.checkout}
                />
            </div>
            </Card>
          ) : null}

          {isBuyer && (campaign.status === "awaiting_approval" || campaign.status === "approved") ? (
            <CancelCampaignForm slug={slug} code={campaign.code} token={buyerToken as string} t={t.gift} />
          ) : null}
        </aside>
      </div>
    </div>
  );
}
