import { headers } from "next/headers";
import Link from "next/link";
import { StoreWorkspaceNotFoundView } from "@/components/NotFoundViews";
import { setGiftCatalogueStatus } from "@/app/actions/gifting";
import { CopyField, SubmitButton } from "@/components/forms";
import { Badge, Breadcrumbs, Callout, EmptyState, PageHeader } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getGiftCatalogue, listGiftCampaigns, listPublishedProducts } from "@/lib/data";
import { campaignPath, campaignToken, portalUrl } from "@/lib/gift-access";
import { approvalWaitLabel, daysAwaitingApproval } from "@/lib/gift-approval";
import { requireStoreAccess } from "@/lib/session";
import { CAMPAIGN_STATUS_LABELS, type CampaignStatus } from "@/lib/types";
import { formatDate, formatMoney } from "@/lib/util";
import {
  CatalogueAccessForm,
  CatalogueDetailsForm,
  CatalogueProductsForm,
} from "../GiftingForms";
import { RegenerateAccess } from "./RegenerateAccess";

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
  if (!catalogue || catalogue.storeId !== storeId)
    return <StoreWorkspaceNotFoundView base={`/app/stores/${storeId}`} />;

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
          description={catalogue.companyName}
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
                <SubmitButton variant="outline" size="sm" pendingLabel="Saving…">
                  {catalogue.status === "active" ? "Pause catalogue" : "Reopen catalogue"}
                </SubmitButton>
              </form>
            </>
          }
        />
      </div>

      {missing.length > 0 ? (
        <Callout tone="amber" title="Some products are unavailable">
          {missing.length} {missing.length === 1 ? "product is" : "products are"} not published. Republish or remove{" "}
          {missing.length === 1 ? "it" : "them"} below.
        </Callout>
      ) : null}

      <Card asChild>
      <section>
        <CardHeader>
        <CardTitle asChild>
          <h2>Portal link</h2>
        </CardTitle>
                <p className="max-w-2xl text-sm text-muted-foreground">
          {catalogue.access === "invite" ? "Invited email addresses only" : "Anyone with the link"}
        </p>
        </CardHeader>
        <CardContent>
        <p className="break-all rounded-lg border border-border bg-canvas px-3 py-2 font-mono text-xs text-inksoft">
          {privateLink}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <a href={privateLink} target="_blank" rel="noreferrer">
              Open the portal ↗
            </a>
          </Button>
          <RegenerateAccess storeId={storeId} catalogueId={catalogue.id} />
        </div>
        </CardContent>
      </section>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card asChild>
        <section>
            <CardHeader>
              <CardTitle asChild>
                <h2>Programme rules</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CatalogueDetailsForm catalogue={catalogue} />
            </CardContent>
        </section>
        </Card>

        <Card asChild>
        <section>
            <CardHeader>
              <CardTitle asChild>
                <h2>Access</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CatalogueAccessForm catalogue={catalogue} />
            </CardContent>
        </section>
        </Card>
      </div>

      <Card asChild>
      <section>
          <CardHeader>
            <CardTitle asChild>
              <h2>Products</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CatalogueProductsForm catalogue={catalogue} products={published} />
          </CardContent>
      </section>
      </Card>

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-foreground">Campaigns from this catalogue</h2>
        {mine.length === 0 ? (
          <EmptyState
            title="No campaigns yet"
            description="Campaigns appear here when a buyer submits a recipient list."
          />
        ) : (
          <ul className="space-y-3">
            {mine.map((campaign) => (
              <li key={campaign.id}>
                <Card size="sm">
                <CardHeader>
                  <div className="min-w-0">
                    <Link
                      href={`/app/stores/${storeId}/orders/campaigns/${campaign.id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {campaign.code} · {campaign.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {campaign.buyer.name} ({campaign.buyer.email}) ·{" "}
                      <span className="tabular-nums">{campaign.recipients.length}</span> recipients ·{" "}
                      {formatDate(campaign.createdAt)}
                    </p>
                  </div>
                  <CardAction className="flex shrink-0 items-center gap-2">
                    <Badge tone={CAMPAIGN_TONES[campaign.status]}>
                      {CAMPAIGN_STATUS_LABELS[campaign.status]}
                    </Badge>
                    <span className="text-sm font-medium tabular-nums text-foreground">
                      {formatMoney(campaign.totals.total, campaign.currency)}
                    </span>
                  </CardAction>
                </CardHeader>
                {approverLinks.get(campaign.id) ? (
                  <CardContent>
                    <p className="text-xs text-muted-foreground">
                      Approval link for{" "}
                      {campaign.approval.approverName || campaign.approval.approverEmail} ·{" "}
                      {approvalWaitLabel(daysAwaitingApproval(campaign)).toLowerCase()} ·{" "}
                      <Link
                        href={`/app/stores/${storeId}/orders/campaigns/${campaign.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                                                Manage approval
                      </Link>
                    </p>
                    <div className="mt-2">
                      <CopyField value={approverLinks.get(campaign.id) as string} label="Copy approval link" />
                    </div>
                  </CardContent>
                ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
