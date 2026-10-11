import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { applySuggestion, dismissSuggestion } from "@/app/actions/ai";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader } from "@/components/ui/card";
import { listCatalogProducts, listStoreProducts, listSuggestions, listSuppliers } from "@/lib/data";
import { requireStoreAccess } from "@/lib/session";
import { storeSku } from "@/lib/sku";
import type { AiSuggestion } from "@/lib/types";
import { formatAgo } from "@/i18n/format";
import { formatDate, formatDateTime } from "@/lib/util";
import { CopyForm, IdeaForm, PriceForm, SupplierForm } from "./AssistantForms";

async function SuggestionBody({ suggestion }: { suggestion: AiSuggestion }) {
  const t = await getTranslations("assistant");
  const payload = suggestion.payload as Record<string, unknown>;
  if (suggestion.kind === "description") {
    return (
      <p className="mt-3 whitespace-pre-line rounded-lg bg-canvas p-3 text-sm text-inksoft">
        {String(payload.description ?? "")}
      </p>
    );
  }
  if (suggestion.kind === "tags") {
    const tags = Array.isArray(payload.tags) ? (payload.tags as string[]) : [];
    return (
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <li key={tag}>
            <Badge tone="neutral">{tag}</Badge>
          </li>
        ))}
      </ul>
    );
  }
  if (suggestion.kind === "price") {
    return (
      <p className="mt-3 rounded-lg bg-canvas p-3 text-sm text-inksoft">
        {t("proposedPrice")} <span className="font-semibold tabular-nums text-foreground">{String(payload.priceMajor ?? "")}</span>
      </p>
    );
  }
  if (suggestion.kind === "supplier") {
    return (
      <div className="mt-3 rounded-lg bg-canvas p-3 text-sm text-inksoft">
        <p>
          {t("recommendedPartner")}{" "}
          <span className="font-semibold text-foreground">{String(payload.supplierName ?? "")}</span>
        </p>
        {payload.risk ? <p className="mt-1.5 text-xs text-muted-foreground">{t("tradeOff", { risk: String(payload.risk) })}</p> : null}
      </div>
    );
  }
  return (
    <div className="mt-3 rounded-lg bg-canvas p-3 text-sm text-inksoft">
      <p className="whitespace-pre-line">{String(payload.description ?? "")}</p>
      <p className="mt-2 text-xs text-muted-foreground">
        {t("ideaMeta", {
          price: String(payload.suggestedPriceMajor ?? "–"),
          tags: Array.isArray(payload.tags) ? (payload.tags as string[]).join(", ") : "–",
        })}
      </p>
    </div>
  );
}

export default async function AssistantPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const { store } = await requireStoreAccess(storeId, "store.catalog");

  const [suggestions, products, catalog, suppliers] = await Promise.all([
    listSuggestions(storeId),
    listStoreProducts(storeId),
    listCatalogProducts(),
    listSuppliers(),
  ]);

  const approved = new Set(suppliers.filter((s) => s.status === "approved").map((s) => s.id));
  const availableCatalog = catalog.filter((c) => c.status === "active" && approved.has(c.supplierId));
  const pending = suggestions.filter((s) => s.status === "pending");
  const decided = suggestions.filter((s) => s.status !== "pending");
  // A store can hold two copies of the same supplier product, so a name on its
  // own is not enough to choose between them — the SKU and import date are.
  const [pages, t, locale, format] = await Promise.all([
    getTranslations("pages.store"),
    getTranslations("assistant"),
    getLocale(),
    getFormatter(),
  ]);
  const now = new Date();
  const productOptions = products.map((p) => ({
    id: p.id,
    label: t("productOption", {
      name: p.name,
      sku: storeSku(p, store.channelCode),
      date: formatDate(p.importedAt, locale),
    }),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={pages("assistantTitle")}
        description={pages("assistantDescription")}
      />

      <section>
        <h2 className="text-base font-semibold text-foreground">
          {/* The count is the Badge's own text, not a span inside it: a child
              element of the Badge is a flex item, which reads as its own line. */}
          {t("pendingReview")}{" "}
          {pending.length > 0 ? (
            <Badge tone="amber" className="tabular-nums">
              {pending.length}
            </Badge>
          ) : null}
        </h2>
        {pending.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title={t("noPending")}
              description={t("noPendingBody")}
            />
          </div>
        ) : (
          <ul className="mt-4 grid gap-4 lg:grid-cols-2">
            {pending.map((suggestion) => {
              const product = products.find((p) => p.id === suggestion.productId);
              return (
                <li key={suggestion.id}>
                  <Card className="h-full">
                  <CardHeader>
                    <div className="min-w-0">
                      <Badge tone="iris">{t(`kind.${suggestion.kind}`)}</Badge>
                      <h3 className="mt-2 text-sm font-semibold text-foreground">{suggestion.title}</h3>
                      {product ? (
                        <p className="text-xs text-muted-foreground">
                          {t("for")}{" "}
                          <Link
                            href={`/app/stores/${storeId}/catalog/${product.id}`}
                            className="hover:underline"
                          >
                            {product.name}
                          </Link>{" "}
                          · <span className="font-mono">{storeSku(product, store.channelCode)}</span>
                        </p>
                      ) : null}
                    </div>
                    <CardAction>
                      <span className="text-xs text-muted-foreground">
                        {formatAgo(format, suggestion.createdAt, now)}
                      </span>
                    </CardAction>
                  </CardHeader>

                  <CardContent>
                    <p className="text-sm text-inksoft">{suggestion.rationale}</p>
                    <SuggestionBody suggestion={suggestion} />

                    <div className="mt-4 flex flex-wrap gap-2">
                      <form action={applySuggestion}>
                        <input type="hidden" name="storeId" value={storeId} />
                        <input type="hidden" name="suggestionId" value={suggestion.id} />
                        <Button type="submit" size="sm">
                          {t("apply")}
                        </Button>
                      </form>
                      <form action={dismissSuggestion}>
                        <input type="hidden" name="storeId" value={storeId} />
                        <input type="hidden" name="suggestionId" value={suggestion.id} />
                        <Button type="submit" variant="outline" size="sm">
                          {t("dismiss")}
                        </Button>
                      </form>
                    </div>
                  </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <IdeaForm storeId={storeId} />
        <SupplierForm storeId={storeId} catalog={availableCatalog.map((c) => ({ id: c.id, name: c.name }))} />
        <CopyForm storeId={storeId} products={productOptions} />
        <PriceForm storeId={storeId} products={productOptions} />
      </section>

      {decided.length > 0 ? (
        <section>
          <h2 className="text-base font-semibold text-foreground">{t("history")}</h2>
          <Card className="mt-3 py-0">
          <ul className="divide-y divide-border">
            {decided.map((suggestion) => (
              <li key={suggestion.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-foreground">{suggestion.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("draftedBy", { kind: t(`kind.${suggestion.kind}`), name: suggestion.createdBy })}
                  </p>
                </div>
                <div className="text-right">
                  <Badge tone={suggestion.status === "applied" ? "green" : "slate"}>
                    {suggestion.status === "applied" ? t("applied") : t("dismissed")}
                  </Badge>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {suggestion.decidedBy} ·{" "}
                    {suggestion.decidedAt ? formatDateTime(suggestion.decidedAt, locale) : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
