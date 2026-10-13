import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Badge, Breadcrumbs, EmptyState, PageHeader } from "@/components/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireStoreAccess } from "@/lib/session";
import { formatDateTime } from "@/lib/util";
import { listEndpoints } from "@/lib/webhooks";
import { CreateEndpointForm } from "./WebhookForms";

/** The column-head style every table in the workspace shares. */
const TH = "px-0 text-xs font-semibold tracking-wide uppercase text-muted-foreground";

export default async function WebhooksPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const { store } = await requireStoreAccess(storeId, "store.settings");
  const [endpoints, t, pages, locale] = await Promise.all([
    listEndpoints(store.id),
    getTranslations("webhooks"),
    getTranslations("pages.store"),
    getLocale(),
  ]);
  const base = `/app/stores/${store.id}`;

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: store.name, href: base },
          { label: pages("settingsTitle"), href: `${base}/setup` },
          { label: t("title") },
        ]}
      />
      <PageHeader
        title={t("title")}
        description={
          <>
            {t("pageDescription")}{" "}
            <Link href="/developers" prefetch={false} className="font-medium text-primary underline-offset-2 hover:underline">
              {t("reference")}
            </Link>
          </>
        }
      />

      {endpoints.length === 0 ? (
        <EmptyState title={t("emptyTitle")} description={t("emptyBody")} />
      ) : (
        <Card asChild>
          <section>
            <CardHeader>
              <CardTitle asChild>
                <h2>{t("endpointsTitle")}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative overflow-x-auto">
                <Table className="min-w-[44rem]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className={TH}>{t("columns.endpoint")}</TableHead>
                      <TableHead className={TH}>{t("columns.topics")}</TableHead>
                      <TableHead className={TH}>{t("columns.lastDelivery")}</TableHead>
                      <TableHead className={`${TH} text-right`}>{t("columns.status")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {endpoints.map((endpoint) => (
                      <TableRow key={endpoint.id} className="hover:bg-transparent">
                        <TableCell className="max-w-sm px-0 py-3 align-top whitespace-normal">
                          <Link
                            href={`${base}/setup/webhooks/${endpoint.id}`}
                            className="font-mono text-sm font-medium break-all text-primary hover:underline"
                          >
                            {endpoint.url}
                          </Link>
                          {endpoint.description ? (
                            <p className="text-xs text-muted-foreground">{endpoint.description}</p>
                          ) : null}
                        </TableCell>
                        <TableCell className="px-0 py-3 align-top text-xs text-inksoft">
                          {t("topicCount", { count: endpoint.topics.length })}
                        </TableCell>
                        <TableCell className="px-0 py-3 align-top text-xs text-inksoft">
                          {endpoint.lastDeliveryAt ? (
                            <>
                              {formatDateTime(endpoint.lastDeliveryAt, locale)}
                              {endpoint.lastStatus === "failed" ? (
                                <span className="block text-destructive">{t("lastFailed")}</span>
                              ) : null}
                            </>
                          ) : (
                            t("never")
                          )}
                        </TableCell>
                        <TableCell className="px-0 py-3 text-right align-top">
                          <Badge tone={endpoint.enabled ? "green" : endpoint.disabledReason === "failures" ? "rose" : "slate"}>
                            {endpoint.enabled
                              ? t("statusEnabled")
                              : endpoint.disabledReason === "failures"
                                ? t("statusFailing")
                                : t("statusDisabled")}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </section>
        </Card>
      )}

      <Card asChild>
        <section>
          <CardHeader>
            <CardTitle asChild>
              <h2>{t("addTitle")}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CreateEndpointForm storeId={store.id} />
          </CardContent>
        </section>
      </Card>
    </div>
  );
}
