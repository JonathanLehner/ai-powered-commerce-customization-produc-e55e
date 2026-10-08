import { headers } from "next/headers";
import Link from "next/link";
import { Badge, Callout, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listGiftCampaigns, listGiftCatalogues, listPublishedProducts } from "@/lib/data";
import { portalUrl } from "@/lib/gift-access";
import { requireStoreAccess } from "@/lib/session";
import { CAMPAIGN_STATUS_LABELS, type CampaignStatus } from "@/lib/types";
import { formatDate, formatMoney } from "@/lib/util";
import { CatalogueCreateForm } from "./GiftingForms";

/** The column-head style every table in the workspace shares. */
const TH = "px-4 text-xs font-semibold tracking-wide uppercase text-muted-foreground";

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
        <h2 className="text-base font-semibold text-foreground">Catalogues</h2>
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
                <li key={catalogue.id} className="flex">
                  <Card className="flex-1">
                  <CardHeader>
                    <CardTitle asChild>
                      <h3>
                        <Link
                          href={`/app/stores/${storeId}/gifting/${catalogue.id}`}
                          className="hover:underline"
                        >
                          {catalogue.name}
                        </Link>
                      </h3>
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {catalogue.companyName} · created {formatDate(catalogue.createdAt)} by{" "}
                      {catalogue.createdBy}
                    </p>
                    <CardAction className="flex shrink-0 flex-wrap items-center gap-2">
                      <Badge tone={catalogue.status === "active" ? "green" : "slate"}>
                        {catalogue.status === "active" ? "Open" : "Paused"}
                      </Badge>
                      <Badge tone="neutral">
                        {catalogue.access === "invite"
                          ? `${catalogue.invitedEmails.length} invited`
                          : "Private link"}
                      </Badge>
                    </CardAction>
                  </CardHeader>

                  <CardContent>
                  <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-xs text-muted-foreground">Products</dt>
                      <dd className="font-medium tabular-nums text-foreground">
                        {catalogue.productIds.length}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Spend limit</dt>
                      <dd className="font-medium tabular-nums text-foreground">
                        {catalogue.spendLimitPerRecipient > 0
                          ? `${formatMoney(catalogue.spendLimitPerRecipient, catalogue.currency)} each`
                          : "No limit"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Approval</dt>
                      <dd className="font-medium text-foreground">
                        {catalogue.approvalRequired
                          ? catalogue.approverName || catalogue.approverEmail
                          : "Not required"}
                      </dd>
                    </div>
                  </dl>

                  <p className="mt-4 truncate rounded-lg border border-border bg-canvas px-3 py-2 font-mono text-xs text-inksoft">
                    {links[index]}
                  </p>
                  </CardContent>

                  <CardFooter className="flex-wrap items-center gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/app/stores/${storeId}/gifting/${catalogue.id}`}>Open catalogue</Link>
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      <span className="tabular-nums">{catalogueCampaigns.length}</span>{" "}
                      {catalogueCampaigns.length === 1 ? "campaign" : "campaigns"}
                    </span>
                  </CardFooter>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-foreground">Campaigns</h2>
        {campaigns.length === 0 ? (
          <EmptyState
            title="No campaigns yet"
            description="A campaign is one bulk order: a buyer's recipient list, the approval on it and every order it produced. They appear here as soon as a buyer submits one."
          />
        ) : (
          <Card className="relative overflow-x-auto py-0">
            <Table className="min-w-[54rem]">
              <TableHeader className="bg-muted">
                <TableRow className="hover:bg-transparent">
                  <TableHead className={TH}>Campaign</TableHead>
                  <TableHead className={TH}>Buyer</TableHead>
                  <TableHead className={TH}>Recipients</TableHead>
                  <TableHead className={TH}>Status</TableHead>
                  <TableHead className={`${TH} text-right`}>Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((campaign) => {
                  const catalogue = catalogues.find((c) => c.id === campaign.catalogueId);
                  return (
                    <TableRow key={campaign.id}>
                      <TableCell className="px-4 py-3 align-top whitespace-normal">
                        <Link
                          href={`/app/stores/${storeId}/orders/campaigns/${campaign.id}`}
                          className="font-medium text-foreground hover:underline"
                        >
                          {campaign.code}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {campaign.name} · {catalogue?.companyName ?? "Catalogue removed"}
                        </p>
                      </TableCell>
                      <TableCell className="px-4 py-3 align-top whitespace-normal">
                        <p className="text-foreground">{campaign.buyer.name}</p>
                        <p className="text-xs text-muted-foreground">{campaign.buyer.email}</p>
                      </TableCell>
                      <TableCell className="px-4 py-3 align-top tabular-nums text-foreground">
                        {campaign.recipients.length}
                      </TableCell>
                      <TableCell className="px-4 py-3 align-top whitespace-normal">
                        <Badge tone={CAMPAIGN_TONES[campaign.status]}>
                          {CAMPAIGN_STATUS_LABELS[campaign.status]}
                        </Badge>
                        <p className="mt-1 text-xs text-muted-foreground">{formatDate(campaign.createdAt)}</p>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right align-top font-medium tabular-nums text-foreground">
                        {formatMoney(campaign.totals.total, campaign.currency)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </section>

      <Card asChild>
        <section>
          <CardHeader>
            <CardTitle asChild>
              <h2>New gift catalogue</h2>
            </CardTitle>
            <p className="max-w-2xl text-sm text-muted-foreground">
              One catalogue per company. You choose which published products it offers, how much may be spent
              on each recipient and who signs a campaign off before it is paid for.
            </p>
          </CardHeader>
          <CardContent className="max-w-2xl">
            <CatalogueCreateForm storeId={storeId} currency={store.defaultCurrency} />
          </CardContent>
        </section>
      </Card>
    </div>
  );
}
