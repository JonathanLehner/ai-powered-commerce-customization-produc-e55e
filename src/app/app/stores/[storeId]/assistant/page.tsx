import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { applySuggestion, dismissOlderSuggestions, dismissSuggestion } from "@/app/actions/ai";
import { AssistantEmbed } from "@/components/assistant/AssistantPanel";
import { SubmitButton } from "@/components/forms";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { Card, CardAction, CardContent, CardHeader } from "@/components/ui/card";
import { listStoreProducts, listSuggestions } from "@/lib/data";
import { requireStoreAccess } from "@/lib/session";
import { storeSku } from "@/lib/sku";
import { groupPendingSuggestions, type PendingEntry } from "@/lib/suggestions";
import type { AiSuggestion, StoreProduct } from "@/lib/types";
import { formatAgo } from "@/i18n/format";
import { formatDateTime } from "@/lib/util";

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

/** What a decided suggestion wrote, or would have written, in one line. */
async function HistoryDetail({ suggestion, product }: { suggestion: AiSuggestion; product?: StoreProduct }) {
  const [t, format] = await Promise.all([getTranslations("assistant"), getFormatter()]);
  const payload = suggestion.payload as Record<string, unknown>;
  let detail: string;
  if (suggestion.kind === "description") {
    detail = t("detailDescription", { text: String(payload.description ?? "") });
  } else if (suggestion.kind === "tags") {
    const tags = Array.isArray(payload.tags) ? (payload.tags as string[]) : [];
    detail = t("detailTags", { tags: tags.join(", ") });
  } else if (suggestion.kind === "price") {
    const major = Number(payload.priceMajor ?? 0);
    const currency = String(payload.currency ?? product?.currency ?? "");
    detail = t("detailPrice", {
      price: currency ? format.number(major, { style: "currency", currency }) : String(major),
    });
  } else if (suggestion.kind === "supplier") {
    detail = t("detailSupplier", { name: String(payload.supplierName ?? "") });
  } else {
    detail = t("detailIdea", { name: String(payload.name ?? suggestion.title) });
  }
  return <p className="line-clamp-2 text-xs text-inksoft">{detail}</p>;
}

async function SuggestionCard({
  entry,
  storeId,
  forName,
  now,
}: {
  entry: PendingEntry;
  storeId: string;
  /** Shown when the group itself does not name the product. */
  forName: string | null;
  now: Date;
}) {
  const [t, format] = await Promise.all([getTranslations("assistant"), getFormatter()]);
  const { suggestion, superseded } = entry;
  return (
    <Card className={superseded ? "h-full opacity-75" : "h-full"}>
      <CardHeader>
        <div className="min-w-0">
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="iris">{t(`kind.${suggestion.kind}`)}</Badge>
            {superseded ? <Badge tone="slate">{t("superseded")}</Badge> : null}
          </div>
          <h3 className="mt-2 text-sm font-semibold text-foreground">{suggestion.title}</h3>
          {forName ? (
            <p className="text-xs text-muted-foreground">
              {t("for")} {forName}
            </p>
          ) : null}
        </div>
        <CardAction>
          <span className="text-xs text-muted-foreground">{formatAgo(format, suggestion.createdAt, now)}</span>
        </CardAction>
      </CardHeader>

      <CardContent>
        <p className="text-sm text-inksoft">{suggestion.rationale}</p>
        <SuggestionBody suggestion={suggestion} />

        <div className="mt-4 flex flex-wrap gap-2">
          <form action={applySuggestion}>
            <input type="hidden" name="storeId" value={storeId} />
            <input type="hidden" name="suggestionId" value={suggestion.id} />
            <SubmitButton size="sm" variant={superseded ? "outline" : undefined} pendingLabel={t("working")}>
              {t("apply")}
            </SubmitButton>
          </form>
          <form action={dismissSuggestion}>
            <input type="hidden" name="storeId" value={storeId} />
            <input type="hidden" name="suggestionId" value={suggestion.id} />
            <SubmitButton variant="outline" size="sm" pendingLabel={t("working")}>
              {t("dismiss")}
            </SubmitButton>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function AssistantPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const { store } = await requireStoreAccess(storeId, "store.catalog");

  const [suggestions, products] = await Promise.all([listSuggestions(storeId), listStoreProducts(storeId)]);

  const pending = suggestions.filter((s) => s.status === "pending");
  const decided = suggestions.filter((s) => s.status !== "pending");
  const groups = groupPendingSuggestions(pending);
  const productById = new Map(products.map((p) => [p.id, p]));
  const [pages, t, locale] = await Promise.all([
    getTranslations("pages.store"),
    getTranslations("assistant"),
    getLocale(),
  ]);
  const now = new Date();

  return (
    <div className="space-y-6">
      <PageHeader
        title={pages("assistantTitle")}
        description={pages("assistantDescription")}
      />

      {/* Product ideas, copy, prices and supplier recommendations are asked for in the chat. */}
      <AssistantEmbed always className="h-[min(40rem,75dvh)] overflow-hidden rounded-xl border border-border" />

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
          <div className="mt-4 space-y-5">
            {groups.map((group) => {
              const product = group.productId ? productById.get(group.productId) : undefined;
              const count = group.current.length + group.older.length;
              return (
                <Card key={group.key} className="gap-4">
                  <CardHeader>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-foreground">
                        {product ? (
                          <Link href={`/app/stores/${storeId}/catalog/${product.id}`} className="hover:underline">
                            {product.name}
                          </Link>
                        ) : group.kind === "product_idea" ? (
                          t("groupIdeas")
                        ) : group.kind === "supplier" ? (
                          t("groupSupplier")
                        ) : (
                          (group.current[0] ?? group.older[0]).suggestion.productName ?? t("removedProduct")
                        )}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {product ? (
                          <>
                            <span className="font-mono">{storeSku(product, store.channelCode)}</span> ·{" "}
                          </>
                        ) : null}
                        {t("pendingCount", { count })}
                      </p>
                    </div>
                    {group.productId && group.older.length > 0 ? (
                      <CardAction>
                        <form action={dismissOlderSuggestions}>
                          <input type="hidden" name="storeId" value={storeId} />
                          <input type="hidden" name="productId" value={group.productId} />
                          {group.older.map((entry) => (
                            <input key={entry.suggestion.id} type="hidden" name="suggestionId" value={entry.suggestion.id} />
                          ))}
                          <SubmitButton variant="outline" size="sm" pendingLabel={t("working")}>
                            {t("dismissOlder")}
                          </SubmitButton>
                        </form>
                      </CardAction>
                    ) : null}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {group.current.length > 0 ? (
                      <ul className="grid gap-4 lg:grid-cols-2">
                        {group.current.map((entry) => (
                          <li key={entry.suggestion.id}>
                            <SuggestionCard
                              entry={entry}
                              storeId={storeId}
                              forName={group.productId ? null : (entry.suggestion.productName ?? null)}
                              now={now}
                            />
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {group.older.length > 0 ? (
                      <details>
                        <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                          {t("olderCount", { count: group.older.length })}
                        </summary>
                        <ul className="mt-3 grid gap-4 lg:grid-cols-2">
                          {group.older.map((entry) => (
                            <li key={entry.suggestion.id}>
                              <SuggestionCard entry={entry} storeId={storeId} forName={null} now={now} />
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {decided.length > 0 ? (
        <section>
          <h2 className="text-base font-semibold text-foreground">{t("history")}</h2>
          <Card className="mt-3 py-0">
          <ul className="divide-y divide-border">
            {decided.map((suggestion) => {
              const product = suggestion.productId ? productById.get(suggestion.productId) : undefined;
              const name =
                product?.name ??
                suggestion.productName ??
                (suggestion.kind === "product_idea" ? String(suggestion.payload.name ?? suggestion.title) : null);
              return (
                <li key={suggestion.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">
                      {product ? (
                        <Link href={`/app/stores/${storeId}/catalog/${product.id}`} className="font-medium hover:underline">
                          {product.name}
                        </Link>
                      ) : (
                        <span className="font-medium">{name ?? suggestion.title}</span>
                      )}
                    </p>
                    <HistoryDetail suggestion={suggestion} product={product} />
                    <p className="mt-0.5 text-xs text-muted-foreground">
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
              );
            })}
          </ul>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
