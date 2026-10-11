import { getLocale, getTranslations } from "next-intl/server";
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
import type { CampaignStatus } from "@/lib/types";
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

  const [pages, t, labels, locale] = await Promise.all([
    getTranslations("pages.store"),
    getTranslations("gifting"),
    getTranslations("labels"),
    getLocale(),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        title={pages("giftingTitle")}
        description={pages("giftingDescription")}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t("catalogues")}
          value={String(catalogues.length)}
          sub={t("productsAvailable", { count: published.length })}
        />
        <StatCard
          label={t("awaitingApproval")}
          value={String(awaiting.length)}
          tone={awaiting.length > 0 ? "amber" : "neutral"}
        />
        <StatCard label={t("approvedUnpaid")} value={String(approved.length)} />
        <StatCard label={t("giftsOrdered")} value={String(gifted)} sub={t("campaignsPaid", { count: ordered.length })} />
      </div>

      {published.length === 0 ? (
        <Callout tone="amber" title={t("noPublishedTitle")}>
          {t("noPublishedBody")}
        </Callout>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-foreground">{t("cataloguesTitle")}</h2>
        {catalogues.length === 0 ? (
          <EmptyState
            title={t("noCatalogues")}
            description={t("noCataloguesBody")}
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
                      {t("createdBy", {
                        company: catalogue.companyName,
                        date: formatDate(catalogue.createdAt, locale),
                        name: catalogue.createdBy,
                      })}
                    </p>
                    <CardAction className="flex shrink-0 flex-wrap items-center gap-2">
                      <Badge tone={catalogue.status === "active" ? "green" : "slate"}>
                        {catalogue.status === "active" ? t("open") : t("paused")}
                      </Badge>
                      <Badge tone="neutral">
                        {catalogue.access === "invite"
                          ? t("invited", { count: catalogue.invitedEmails.length })
                          : t("privateLink")}
                      </Badge>
                    </CardAction>
                  </CardHeader>

                  <CardContent>
                  <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("products")}</dt>
                      <dd className="font-medium tabular-nums text-foreground">
                        {catalogue.productIds.length}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("spendLimit")}</dt>
                      <dd className="font-medium tabular-nums text-foreground">
                        {catalogue.spendLimitPerRecipient > 0
                          ? t("each", { amount: formatMoney(catalogue.spendLimitPerRecipient, catalogue.currency, locale) })
                          : t("noLimit")}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("approval")}</dt>
                      <dd className="font-medium text-foreground">
                        {catalogue.approvalRequired
                          ? catalogue.approverName || catalogue.approverEmail
                          : t("notRequired")}
                      </dd>
                    </div>
                  </dl>

                  <p className="mt-4 truncate rounded-lg border border-border bg-canvas px-3 py-2 font-mono text-xs text-inksoft">
                    {links[index]}
                  </p>
                  </CardContent>

                  <CardFooter className="flex-wrap items-center gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/app/stores/${storeId}/gifting/${catalogue.id}`}>{t("openCatalogue")}</Link>
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      <span className="tabular-nums">{t("campaignCount", { count: catalogueCampaigns.length })}</span>
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
        <h2 className="text-base font-semibold text-foreground">{t("campaigns")}</h2>
        {campaigns.length === 0 ? (
          <EmptyState
            title={t("noCampaigns")}
            description={t("noCampaignsBody")}
          />
        ) : (
          <Card className="relative overflow-x-auto py-0">
            <Table className="min-w-[54rem]">
              <TableHeader className="bg-muted">
                <TableRow className="hover:bg-transparent">
                  <TableHead className={TH}>{t("colCampaign")}</TableHead>
                  <TableHead className={TH}>{t("colBuyer")}</TableHead>
                  <TableHead className={TH}>{t("colRecipients")}</TableHead>
                  <TableHead className={TH}>{t("colStatus")}</TableHead>
                  <TableHead className={`${TH} text-right`}>{t("colValue")}</TableHead>
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
                          {campaign.name} · {catalogue?.companyName ?? t("catalogueRemoved")}
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
                          {labels(`campaignStatus.${campaign.status}`)}
                        </Badge>
                        <p className="mt-1 text-xs text-muted-foreground">{formatDate(campaign.createdAt, locale)}</p>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right align-top font-medium tabular-nums text-foreground">
                        {formatMoney(campaign.totals.total, campaign.currency, locale)}
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
              <h2>{t("newCatalogue")}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="max-w-2xl">
            <CatalogueCreateForm storeId={storeId} currency={store.defaultCurrency} />
          </CardContent>
        </section>
      </Card>
    </div>
  );
}
