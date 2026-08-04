import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { regenerateGiftLink, setGiftCatalogueStatus } from "@/app/actions/gifting";
import { ConfirmSubmit, SubmitButton } from "@/components/forms";
import { Badge, Breadcrumbs, Callout, EmptyState, PageHeader } from "@/components/ui";
import { getGiftCatalogue, listGiftCampaigns, listPublishedProducts } from "@/lib/data";
import { campaignPath, campaignToken, portalUrl } from "@/lib/gift-access";
import { requireStoreAccess } from "@/lib/session";
import { CAMPAIGN_STATUS_LABELS, type CampaignStatus } from "@/lib/types";
import { formatDate, formatMoney } from "@/lib/util";
import {
  CatalogueAccessForm,
  CatalogueDetailsForm,
  CatalogueProductsForm,
} from "../GiftingForms";

const CAMPAIGN_TONES: Record<CampaignStatus, "amber" | "brand" | "green" | "rose" | "slate"> = {
  awaiting_approval: "amber",
  approved: "brand",
  declined: "rose",
  ordered: "green",
  cancelled: "slate",
};

export default async function GiftCataloguePage({
  params,
}: {
  params: Promise<{ storeId: string; catalogueId: string }>;
}) {
  const { storeId, catalogueId } = await params;
  await requireStoreAccess(storeId, "store.gifting");

  const catalogue = await getGiftCatalogue(catalogueId);
  if (!catalogue || catalogue.storeId !== storeId) notFound();

  const [published, campaigns, headerList] = await Promise.all([
    listPublishedProducts(storeId),
    listGiftCampaigns(storeId),
    headers(),
  ]);

  const host = headerList.get("host") ?? "";
  const proto = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = host ? `${proto}://${host}` : "";
  const privateLink = await portalUrl(origin, catalogue);

  const mine = campaigns.filter((campaign) => campaign.catalogueId === catalogue.id);
  const approverLinks = new Map(
    await Promise.all(
      mine
        .filter((campaign) => campaign.status === "awaiting_approval")
        .map(
          async (campaign) =>
            [
              campaign.id,
              `${origin}${campaignPath(catalogue.slug, campaign.code, await campaignToken(campaign.id, "approver"), "approver")}`,
            ] as const,
        ),
    ),
  );
  const missing = catalogue.productIds.filter((id) => !published.some((product) => product.id === id));

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs
          items={[
            { label: "Gifting", href: `/app/stores/${storeId}/gifting` },
            { label: catalogue.name },
          ]}
        />
        <PageHeader
          title={catalogue.name}
          description={`Private gift catalogue for ${catalogue.companyName}. Buyers order for a list of recipients inside the rules set here.`}
          actions={
            <>
              <Badge tone={catalogue.status === "active" ? "green" : "slate"}>
                {catalogue.status === "active" ? "Open" : "Paused"}
              </Badge>
              <form action={setGiftCatalogueStatus}>
                <input type="hidden" name="storeId" value={storeId} />
                <input type="hidden" name="catalogueId" value={catalogue.id} />
                <input
                  type="hidden"
                  name="status"
                  value={catalogue.status === "active" ? "paused" : "active"}
                />
                <SubmitButton className="btn-secondary btn-sm" pendingLabel="Saving…">
                  {catalogue.status === "active" ? "Pause catalogue" : "Reopen catalogue"}
                </SubmitButton>
              </form>
            </>
          }
        />
      </div>

      {missing.length > 0 ? (
        <Callout tone="amber" title="Some chosen products are no longer live">
          {missing.length} {missing.length === 1 ? "product is" : "products are"} unpublished or waiting on preview
          approval, so buyers cannot order {missing.length === 1 ? "it" : "them"}. Publish{" "}
          {missing.length === 1 ? "it" : "them"} again or take {missing.length === 1 ? "it" : "them"} out of the
          catalogue below.
        </Callout>
      ) : null}

      <section className="card p-5">
        <h2 className="text-base font-semibold text-ink">The portal</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          This is the whole catalogue for the company: the private address, the products it offers and the bulk
          order screen. It is never linked from the public storefront.{" "}
          {catalogue.access === "invite"
            ? "Anyone opening it is asked for their work email and let in only if it is on the invitation list."
            : "Anyone holding this link can open it, so send it to the buying team rather than a mailing list."}
        </p>
        <p className="mt-4 break-all rounded-lg border border-line bg-canvas px-3 py-2 font-mono text-xs text-inksoft">
          {privateLink}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <a href={privateLink} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">
            Open the portal ↗
          </a>
          <form action={regenerateGiftLink}>
            <input type="hidden" name="storeId" value={storeId} />
            <input type="hidden" name="catalogueId" value={catalogue.id} />
            <ConfirmSubmit
              className="btn-ghost btn-sm"
              confirmLabel="Regenerate access"
              question="Every link already sent stops working and everyone signed in is signed out."
            >
              Regenerate access
            </ConfirmSubmit>
          </form>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-base font-semibold text-ink">Programme rules</h2>
          <p className="mt-1 text-sm text-muted">
            The spend limit is per recipient, not per campaign, and it is enforced when the list is read and again
            before the card is charged.
          </p>
          <div className="mt-5">
            <CatalogueDetailsForm catalogue={catalogue} />
          </div>
        </section>

        <section className="card p-5">
          <h2 className="text-base font-semibold text-ink">Access</h2>
          <p className="mt-1 text-sm text-muted">
            A gifting buyer has no Parcelith account: access is the private link, or their work email against the
            invitation list.
          </p>
          <div className="mt-5">
            <CatalogueAccessForm catalogue={catalogue} />
          </div>
        </section>
      </div>

      <section className="card p-5">
        <h2 className="text-base font-semibold text-ink">Products in the catalogue</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Drawn from this store&rsquo;s published products. Anything unpublished later simply drops out of the
          portal — a recipient list naming it is rejected with the row that has to change.
        </p>
        <div className="mt-5">
          <CatalogueProductsForm catalogue={catalogue} products={published} />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-ink">Campaigns from this catalogue</h2>
        {mine.length === 0 ? (
          <EmptyState
            title="No campaigns yet"
            description="Once a buyer submits a recipient list it appears here, with its approval state and every order it produced."
          />
        ) : (
          <ul className="space-y-3">
            {mine.map((campaign) => (
              <li key={campaign.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/app/stores/${storeId}/orders/campaigns/${campaign.id}`}
                      className="font-medium text-ink hover:underline"
                    >
                      {campaign.code} · {campaign.name}
                    </Link>
                    <p className="text-xs text-muted">
                      {campaign.buyer.name} ({campaign.buyer.email}) · {campaign.recipients.length} recipients ·{" "}
                      {formatDate(campaign.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={CAMPAIGN_TONES[campaign.status]}>
                      {CAMPAIGN_STATUS_LABELS[campaign.status]}
                    </Badge>
                    <span className="text-sm font-medium tabular-nums text-ink">
                      {formatMoney(campaign.totals.total, campaign.currency)}
                    </span>
                  </div>
                </div>
                {approverLinks.get(campaign.id) ? (
                  <p className="mt-3 break-all rounded-lg border border-line bg-canvas px-3 py-2 font-mono text-xs text-inksoft">
                    Approval link for {campaign.approval.approverName || campaign.approval.approverEmail}:{" "}
                    {approverLinks.get(campaign.id)}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
