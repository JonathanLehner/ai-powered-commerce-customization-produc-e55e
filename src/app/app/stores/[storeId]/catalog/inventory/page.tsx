import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { ListPager } from "@/components/OrdersPager";
import { Badge, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listAdjustments } from "@/lib/inventory";
import { filterInventory, inventorySettings, parseInventoryFilter } from "@/lib/inventory-rules";
import { storeInventory } from "@/lib/operations/inventory";
import { requireStoreAccess, roleCan } from "@/lib/session";
import { formatDateTime } from "@/lib/util";
import { CatalogTabs } from "../CatalogTabs";
import { InventoryImport, InventorySettingsForm, InventoryToolbar } from "./InventoryForms";
import { InventoryTable } from "./InventoryTable";

const PAGE_SIZE = 50;

export default async function InventoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ q?: string; filter?: string; page?: string }>;
}) {
  const { storeId } = await params;
  const query = await searchParams;
  const { store, role } = await requireStoreAccess(storeId);
  const canEdit = roleCan(role, "store.catalog");
  const settings = inventorySettings(store);
  const q = query.q?.trim() ?? "";
  const filter = parseInventoryFilter(query.filter);

  const [{ rows }, history, t, pager, locale] = await Promise.all([
    storeInventory(storeId, settings),
    listAdjustments(storeId, { limit: 50 }),
    getTranslations("inventory"),
    getTranslations("pager"),
    getLocale(),
  ]);
  const filtered = filterInventory(rows, q, filter);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(Number(query.page)) || 1), pages);
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const tracked = rows.filter((row) => row.tracked);
  const base = `/app/stores/${storeId}/catalog/inventory`;
  const search = (extra: Record<string, string | number> = {}) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (filter !== "all") params.set("filter", filter);
    for (const [key, value] of Object.entries(extra)) params.set(key, String(value));
    const text = params.toString();
    return text ? `?${text}` : "";
  };

  return (
    <div className="space-y-6">
      <CatalogTabs storeId={storeId} active="inventory" />
      <PageHeader
        title={t("title")}
        actions={
          <>
            <Button asChild variant="outline">
              <a href={`${base}/export${search()}`} download>
                {t("export")}
              </a>
            </Button>
            {canEdit ? <InventoryImport storeId={storeId} /> : null}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("statTracked")} value={String(tracked.length)} sub={t("statOf", { count: rows.length })} />
        <StatCard
          label={t("statAvailable")}
          value={String(tracked.reduce((sum, row) => sum + Math.max(0, row.available), 0))}
        />
        <StatCard
          label={t("statLow")}
          value={String(tracked.filter((row) => row.state === "low").length)}
          tone="amber"
          href={`${base}?filter=low`}
        />
        <StatCard
          label={t("statOut")}
          value={String(tracked.filter((row) => row.state === "out").length)}
          tone="rose"
          href={`${base}?filter=out`}
        />
      </div>

      <InventoryToolbar base={base} q={q} filter={filter} />

      {shown.length === 0 ? (
        <EmptyState
          title={rows.length === 0 ? t("emptyTitle") : t("noMatches")}
          description={rows.length === 0 ? t("emptyBody") : t("tryFilters")}
        />
      ) : (
        <div className="space-y-3">
          <InventoryTable
            key={`${q}|${filter}|${page}`}
            storeId={storeId}
            rows={shown}
            canEdit={canEdit}
            threshold={settings.lowStockThreshold}
          />
          <ListPager
            page={{ page, pages, total: filtered.length }}
            summary={pager("variants", {
              first: (page - 1) * PAGE_SIZE + 1,
              last: Math.min(page * PAGE_SIZE, filtered.length),
              total: filtered.length,
            })}
            href={(n) => `${base}${search({ page: n })}`}
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle asChild>
              <h2>{t("historyTitle")}</h2>
            </CardTitle>
            <CardDescription>{t("historyBody")}</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {history.length === 0 ? (
              <p className="px-4 text-sm text-muted-foreground">{t("historyEmpty")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">{t("colWhen")}</TableHead>
                    <TableHead>{t("colVariant")}</TableHead>
                    <TableHead className="text-right">{t("colDelta")}</TableHead>
                    <TableHead className="text-right">{t("colOnHand")}</TableHead>
                    <TableHead>{t("colReason")}</TableHead>
                    <TableHead className="pr-4">{t("colBy")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="pl-4 text-xs whitespace-nowrap text-muted-foreground">
                        {formatDateTime(entry.at, locale)}
                      </TableCell>
                      <TableCell className="max-w-[16rem]">
                        <p className="truncate text-sm text-foreground">
                          {entry.productName} · {entry.variantName}
                        </p>
                        {entry.sku ? <p className="truncate font-mono text-xs text-muted-foreground">{entry.sku}</p> : null}
                      </TableCell>
                      <TableCell
                        className={
                          entry.delta > 0
                            ? "text-right font-medium tabular-nums text-emerald-700"
                            : "text-right font-medium tabular-nums text-rose-700"
                        }
                      >
                        {entry.delta > 0 ? `+${entry.delta}` : `−${Math.abs(entry.delta)}`}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{entry.onHandAfter}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge tone={entry.reason === "sold" ? "brand" : entry.reason === "restock" ? "green" : "neutral"}>
                          {t(`reasons.${entry.reason}`)}
                        </Badge>
                        {entry.reference ? (
                          <span className="ml-2 font-mono text-xs text-muted-foreground">{entry.reference}</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="pr-4 text-sm whitespace-nowrap">{entry.actorName}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle asChild>
              <h2>{t("settingsTitle")}</h2>
            </CardTitle>
            <CardDescription>{t("settingsBody")}</CardDescription>
          </CardHeader>
          <CardContent>
            {canEdit ? (
              <InventorySettingsForm storeId={storeId} settings={settings} />
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("thresholdValue", { count: settings.lowStockThreshold })}
              </p>
            )}
            <p className="mt-4 text-xs text-muted-foreground">
              <Link href={`/app/stores/${storeId}/activity?category=inventory`} className="text-primary hover:underline">
                {t("activityLink")}
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
