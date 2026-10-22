import { getLocale, getTranslations } from "next-intl/server";
import { StoreWorkspaceNotFoundView } from "@/components/NotFoundViews";
import { Badge, Breadcrumbs, Callout, EmptyState, PageHeader } from "@/components/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireStoreAccess } from "@/lib/session";
import { formatDateTime } from "@/lib/util";
import { DISABLE_AFTER_FAILURES } from "@/lib/webhook-rules";
import { findEndpoint, hostOf, listDeliveries, type DeliveryStatus } from "@/lib/webhooks";
import {
  DeleteEndpointForm,
  EditEndpointForm,
  EnableEndpointForm,
  ResendForm,
  SecretPanel,
} from "../WebhookForms";

/** The column-head style every table in the workspace shares. */
const TH = "px-0 text-xs font-semibold tracking-wide uppercase text-muted-foreground";

const TONES: Record<DeliveryStatus, "green" | "amber" | "rose" | "slate" | "brand"> = {
  pending: "brand",
  retrying: "amber",
  succeeded: "green",
  failed: "rose",
  cancelled: "slate",
};

export default async function WebhookEndpointPage({
  params,
}: {
  params: Promise<{ storeId: string; endpointId: string }>;
}) {
  const { storeId, endpointId } = await params;
  const { store } = await requireStoreAccess(storeId, "store.settings");
  const endpoint = await findEndpoint(store.id, endpointId);
  if (!endpoint) return <StoreWorkspaceNotFoundView base={`/app/stores/${store.id}`} />;
  const [deliveries, t, pages, locale] = await Promise.all([
    listDeliveries(store.id, endpoint.id, 50),
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
          { label: t("title"), href: `${base}/setup/webhooks` },
          { label: endpoint.description || hostOf(endpoint.url) },
        ]}
      />
      <PageHeader
        title={endpoint.description || hostOf(endpoint.url)}
        description={<span className="font-mono break-all">{endpoint.url}</span>}
        actions={
          <>
            <Badge tone={endpoint.enabled ? "green" : endpoint.disabledReason === "failures" ? "rose" : "slate"}>
              {endpoint.enabled
                ? t("statusEnabled")
                : endpoint.disabledReason === "failures"
                  ? t("statusFailing")
                  : t("statusDisabled")}
            </Badge>
            <EnableEndpointForm storeId={store.id} endpointId={endpoint.id} enabled={endpoint.enabled} />
          </>
        }
      />

      {!endpoint.enabled && endpoint.disabledReason === "failures" ? (
        <Callout tone="rose" title={t("autoDisabledTitle")}>
          {t("autoDisabledBody", {
            count: DISABLE_AFTER_FAILURES,
            date: endpoint.disabledAt ? formatDateTime(endpoint.disabledAt, locale) : "",
          })}
        </Callout>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card asChild>
            <section>
              <CardHeader>
                <CardTitle asChild>
                  <h2>{t("deliveriesTitle")}</h2>
                </CardTitle>
                <p className="text-sm text-muted-foreground">{t("deliveriesBody")}</p>
              </CardHeader>
              <CardContent>
                {deliveries.length === 0 ? (
                  <EmptyState title={t("noDeliveriesTitle")} description={t("noDeliveriesBody")} />
                ) : (
                  <div className="relative overflow-x-auto">
                    <Table className="min-w-[40rem]">
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className={TH}>{t("columns.event")}</TableHead>
                          <TableHead className={TH}>{t("columns.status")}</TableHead>
                          <TableHead className={TH}>{t("columns.response")}</TableHead>
                          <TableHead className={TH}>{t("columns.attempts")}</TableHead>
                          <TableHead className={`${TH} text-right`}>
                            <span className="sr-only">{t("resend")}</span>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {deliveries.map((delivery) => {
                          const last = delivery.attempts.at(-1);
                          return (
                            <TableRow key={delivery.id} className="hover:bg-transparent">
                              <TableCell className="px-0 py-3 align-top whitespace-normal">
                                <p className="font-mono text-xs font-medium text-foreground">{delivery.topic}</p>
                                <p className="text-xs text-muted-foreground">{formatDateTime(delivery.createdAt, locale)}</p>
                                <details className="mt-1">
                                  <summary className="cursor-pointer text-xs text-primary hover:underline">{t("payload")}</summary>
                                  <pre className="mt-1 max-h-64 max-w-md overflow-auto rounded-md border border-border bg-muted p-2 font-mono text-[11px] whitespace-pre-wrap text-inksoft">
                                    {JSON.stringify(JSON.parse(delivery.payload), null, 2)}
                                  </pre>
                                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">{delivery.id}</p>
                                </details>
                              </TableCell>
                              <TableCell className="px-0 py-3 align-top">
                                <Badge tone={TONES[delivery.status]}>{t(`deliveryStatus.${delivery.status}`)}</Badge>
                                {delivery.status === "retrying" && delivery.nextAttemptAt ? (
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {t("nextAttempt", { date: formatDateTime(delivery.nextAttemptAt, locale) })}
                                  </p>
                                ) : null}
                              </TableCell>
                              <TableCell className="px-0 py-3 align-top text-xs text-inksoft">
                                {last
                                  ? last.responseCode !== null
                                    ? <span className="font-mono">{last.responseCode}</span>
                                    : t(`error.${last.error ?? "network"}`)
                                  : t("never")}
                                {last ? <span className="block text-muted-foreground">{t("duration", { ms: last.durationMs })}</span> : null}
                              </TableCell>
                              <TableCell className="px-0 py-3 align-top text-xs text-inksoft tabular-nums">
                                {delivery.attempts.length}
                              </TableCell>
                              <TableCell className="px-0 py-3 text-right align-top">
                                {endpoint.enabled && delivery.status !== "pending" ? (
                                  <ResendForm storeId={store.id} deliveryId={delivery.id} />
                                ) : null}
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

          <Card asChild>
            <section>
              <CardHeader>
                <CardTitle asChild>
                  <h2>{t("settingsTitle")}</h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <EditEndpointForm
                  storeId={store.id}
                  endpointId={endpoint.id}
                  url={endpoint.url}
                  description={endpoint.description}
                  topics={endpoint.topics}
                />
              </CardContent>
            </section>
          </Card>
        </div>

        <div className="space-y-6">
          <Card asChild>
            <section>
              <CardHeader>
                <CardTitle asChild>
                  <h2>{t("secretTitle")}</h2>
                </CardTitle>
                <p className="text-sm text-muted-foreground">{t("secretBody")}</p>
              </CardHeader>
              <CardContent>
                <SecretPanel storeId={store.id} endpointId={endpoint.id} secret={endpoint.secret} />
              </CardContent>
            </section>
          </Card>

          <Card asChild>
            <section>
              <CardHeader>
                <CardTitle asChild>
                  <h2>{t("deleteTitle")}</h2>
                </CardTitle>
                <p className="text-sm text-muted-foreground">{t("deleteBody")}</p>
              </CardHeader>
              <CardContent>
                <DeleteEndpointForm storeId={store.id} endpointId={endpoint.id} />
              </CardContent>
            </section>
          </Card>
        </div>
      </div>
    </div>
  );
}
