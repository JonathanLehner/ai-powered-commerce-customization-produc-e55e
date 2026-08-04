import { headers } from "next/headers";
import Link from "next/link";
import { Badge, Callout, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { listGiftCampaigns, listGiftCatalogues, listPublishedProducts } from "@/lib/data";
import { portalUrl } from "@/lib/gift-access";
import { requireStoreAccess } from "@/lib/session";
import { CAMPAIGN_STATUS_LABELS, type CampaignStatus } from "@/lib/types";
import { formatDate, formatMoney } from "@/lib/util";
import { CatalogueCreateForm } from "./GiftingForms";

const CAMPAIGN_TONES: Record<CampaignStatus, "amber" | "brand" | "green" | "rose" | "slate"> = {
  awaiting_approval: "amber",
  approved: "brand",
  declined: "rose",
  ordered: "green",
  cancelled: "slate",
};

export default async function GiftingPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const { store } = await requireStoreAccess(storeId, "store.gifting");

  const [catalogues, campaigns, published, headerList] = await Promise.all([
    listGiftCatalogues(storeId),
    listGiftCampaigns(storeId),
    listPublishedProducts(storeId),
    headers(),
  ]);

  // The private link is pasted into an email by hand, so it needs the full
  // origin the person is looking at, not a relative path.
  const host = headerList.get("host") ?? "";
  const proto = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = host ? `${proto}://${host}` : "";
  const links = await Promise.all(catalogues.map((catalogue) => portalUrl(origin, catalogue)));

  const awaiting = campaigns.filter((c) => c.status === "awaiting_approval");
  const approved = campaigns.filter((c) => c.status === "approved");
  const ordered = campaigns.filter((c) => c.status === "ordered");
  const gifted = ordered.reduce((sum, c) => sum + c.recipients.length, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Corporate gifting"
        description="Private gift catalogues for the companies this store supplies: a gated portal drawn from the published catalog, bulk ordering from a recipient list, a spend limit per person and an approval step before anything is paid for."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Gift catalogues" value={String(catalogues.length)} sub={`${published.length} products publishable`} />
        <StatCard
          label="Awaiting approval"
          value={String(awaiting.length)}
          tone={awaiting.length > 0 ? "amber" : "neutral"}
          sub="With the company's approver"
        />
        <StatCard label="Approved, unpaid" value={String(approved.length)} sub="Waiting on the buyer" />
        <StatCard label="Gifts ordered" value={String(gifted)} sub={`${ordered.length} campaigns paid`} />
      </div>

      {published.length === 0 ? (
        <Callout tone="amber" title="Nothing to put in a gift catalogue yet">
          A gift catalogue offers this store&rsquo;s own published products. Publish at least one product first —
          drafts and products with unapproved previews are never offered to a gifting buyer.
        </Callout>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-ink">Catalogues</h2>
        {catalogues.length === 0 ? (
          <EmptyState
            title="No gift catalogue yet"
            description="A gift catalogue is a private, link- or invite-gated shop for one company. Create one below, choose the products it offers and share the link with the people who buy for that company."
          />
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2">
            {catalogues.map((catalogue, index) => {
              const catalogueCampaigns = campaigns.filter((c) => c.catalogueId === catalogue.id);
              return (
                <li key={catalogue.id} className="card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/app/stores/${storeId}/gifting/${catalogue.id}`}
                        className="text-base font-semibold text-ink hover:underline"
                      >
                        {catalogue.name}
                      </Link>
                      <p className="mt-0.5 text-sm text-muted">
                        {catalogue.companyName} · created {formatDate(catalogue.createdAt)} by {catalogue.createdBy}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Badge tone={catalogue.status === "active" ? "green" : "slate"}>
                        {catalogue.status === "active" ? "Open" : "Paused"}
                      </Badge>
                      <Badge tone="neutral">
                        {catalogue.access === "invite"
                          ? `${catalogue.invitedEmails.length} invited`
                          : "Private link"}
                      </Badge>
                    </div>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-xs text-muted">Products</dt>
                      <dd className="font-medium text-ink">{catalogue.productIds.length}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Spend limit</dt>
                      <dd className="font-medium text-ink">
                        {catalogue.spendLimitPerRecipient > 0
                          ? `${formatMoney(catalogue.spendLimitPerRecipient, catalogue.currency)} each`
                          : "No limit"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Approval</dt>
                      <dd className="font-medium text-ink">
                        {catalogue.approvalRequired ? catalogue.approverName || catalogue.approverEmail : "Not required"}
                      </dd>
                    </div>
                  </dl>

                  <p className="mt-4 truncate rounded-lg border border-line bg-canvas px-3 py-2 font-mono text-xs text-inksoft">
                    {links[index]}
                  </p>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Link href={`/app/stores/${storeId}/gifting/${catalogue.id}`} className="btn-secondary btn-sm">
                      Open catalogue
                    </Link>
                    <span className="text-xs text-muted">
                      {catalogueCampaigns.length} {catalogueCampaigns.length === 1 ? "campaign" : "campaigns"}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-ink">Campaigns</h2>
        {campaigns.length === 0 ? (
          <EmptyState
            title="No campaigns yet"
            description="A campaign is one bulk order: a buyer's recipient list, the approval on it and every order it produced. They appear here as soon as a buyer submits one."
          />
        ) : (
          <div className="card relative overflow-x-auto">
            <table className="w-full min-w-[54rem] text-left text-sm">
              <thead className="bg-canvas text-xs font-semibold uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3">Campaign</th>
                  <th scope="col" className="px-4 py-3">Buyer</th>
                  <th scope="col" className="px-4 py-3">Recipients</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3 text-right">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {campaigns.map((campaign) => {
                  const catalogue = catalogues.find((c) => c.id === campaign.catalogueId);
                  return (
                    <tr key={campaign.id} className="align-top">
                      <td className="px-4 py-3">
                        <Link
                          href={`/app/stores/${storeId}/orders/campaigns/${campaign.id}`}
                          className="font-medium text-ink hover:underline"
                        >
                          {campaign.code}
                        </Link>
                        <p className="text-xs text-muted">
                          {campaign.name} · {catalogue?.companyName ?? "Catalogue removed"}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-ink">{campaign.buyer.name}</p>
                        <p className="text-xs text-muted">{campaign.buyer.email}</p>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-ink">{campaign.recipients.length}</td>
                      <td className="px-4 py-3">
                        <Badge tone={CAMPAIGN_TONES[campaign.status]}>
                          {CAMPAIGN_STATUS_LABELS[campaign.status]}
                        </Badge>
                        <p className="mt-1 text-xs text-muted">{formatDate(campaign.createdAt)}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums text-ink">
                        {formatMoney(campaign.totals.total, campaign.currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card p-5">
        <h2 className="text-base font-semibold text-ink">New gift catalogue</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          One catalogue per company. You choose which published products it offers, how much may be spent on each
          recipient and who signs a campaign off before it is paid for.
        </p>
        <div className="mt-5 max-w-2xl">
          <CatalogueCreateForm storeId={storeId} currency={store.defaultCurrency} />
        </div>
      </section>
    </div>
  );
}
