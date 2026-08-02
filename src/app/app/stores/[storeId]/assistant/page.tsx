import Link from "next/link";
import { applySuggestion, dismissSuggestion } from "@/app/actions/ai";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { listCatalogProducts, listStoreProducts, listSuggestions, listSuppliers } from "@/lib/data";
import { requireStoreAccess } from "@/lib/session";
import type { AiSuggestion } from "@/lib/types";
import { formatDateTime, relativeTime } from "@/lib/util";
import { CopyForm, IdeaForm, PriceForm, SupplierForm } from "./AssistantForms";

const KIND_LABELS: Record<AiSuggestion["kind"], string> = {
  product_idea: "Product idea",
  supplier: "Supplier",
  description: "Description",
  tags: "Tags",
  price: "Price",
};

function SuggestionBody({ suggestion }: { suggestion: AiSuggestion }) {
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
          <li key={tag} className="chip">
            {tag}
          </li>
        ))}
      </ul>
    );
  }
  if (suggestion.kind === "price") {
    return (
      <p className="mt-3 rounded-lg bg-canvas p-3 text-sm text-inksoft">
        Proposed price: <span className="font-semibold text-ink">{String(payload.priceMajor ?? "")}</span>
      </p>
    );
  }
  if (suggestion.kind === "supplier") {
    return (
      <div className="mt-3 rounded-lg bg-canvas p-3 text-sm text-inksoft">
        <p>
          Recommended partner:{" "}
          <span className="font-semibold text-ink">{String(payload.supplierName ?? "")}</span>
        </p>
        {payload.risk ? <p className="mt-1.5 text-xs text-muted">Trade-off: {String(payload.risk)}</p> : null}
      </div>
    );
  }
  return (
    <div className="mt-3 rounded-lg bg-canvas p-3 text-sm text-inksoft">
      <p className="whitespace-pre-line">{String(payload.description ?? "")}</p>
      <p className="mt-2 text-xs text-muted">
        Proposed price {String(payload.suggestedPriceMajor ?? "—")} · tags{" "}
        {Array.isArray(payload.tags) ? (payload.tags as string[]).join(", ") : "—"}
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
  const productOptions = products.map((p) => ({ id: p.id, name: p.name }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assistant"
        description="Suggestions stay pending until you apply one. Applying is recorded in the audit history."
      />

      <section>
        <h2 className="text-base font-semibold text-ink">
          Pending review {pending.length > 0 ? <Badge tone="amber">{pending.length}</Badge> : null}
        </h2>
        {pending.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title="Nothing waiting for a decision"
              description="Use one of the request panels below to draft product ideas, copy, tags, pricing or a supplier recommendation."
            />
          </div>
        ) : (
          <ul className="mt-4 grid gap-4 lg:grid-cols-2">
            {pending.map((suggestion) => {
              const product = products.find((p) => p.id === suggestion.productId);
              return (
                <li key={suggestion.id} className="card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Badge tone="iris">{KIND_LABELS[suggestion.kind]}</Badge>
                      <h3 className="mt-2 text-sm font-semibold text-ink">{suggestion.title}</h3>
                      {product ? (
                        <p className="text-xs text-muted">
                          For{" "}
                          <Link
                            href={`/app/stores/${storeId}/catalog/${product.id}`}
                            className="hover:underline"
                          >
                            {product.name}
                          </Link>
                        </p>
                      ) : null}
                    </div>
                    <span className="text-xs text-muted">{relativeTime(suggestion.createdAt)}</span>
                  </div>

                  <p className="mt-2 text-sm text-inksoft">{suggestion.rationale}</p>
                  <SuggestionBody suggestion={suggestion} />

                  <div className="mt-4 flex flex-wrap gap-2">
                    <form action={applySuggestion}>
                      <input type="hidden" name="storeId" value={storeId} />
                      <input type="hidden" name="suggestionId" value={suggestion.id} />
                      <button type="submit" className="btn-primary btn-sm">
                        Apply this change
                      </button>
                    </form>
                    <form action={dismissSuggestion}>
                      <input type="hidden" name="storeId" value={storeId} />
                      <input type="hidden" name="suggestionId" value={suggestion.id} />
                      <button type="submit" className="btn-secondary btn-sm">
                        Dismiss
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <IdeaForm storeId={storeId} storeName={store.name} />
        <SupplierForm storeId={storeId} catalog={availableCatalog.map((c) => ({ id: c.id, name: c.name }))} />
        <CopyForm storeId={storeId} products={productOptions} />
        <PriceForm storeId={storeId} products={productOptions} />
      </section>

      {decided.length > 0 ? (
        <section>
          <h2 className="text-base font-semibold text-ink">Decision history</h2>
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
            {decided.map((suggestion) => (
              <li key={suggestion.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{suggestion.title}</p>
                  <p className="text-xs text-muted">
                    {KIND_LABELS[suggestion.kind]} · drafted by {suggestion.createdBy}
                  </p>
                </div>
                <div className="text-right">
                  <Badge tone={suggestion.status === "applied" ? "green" : "slate"}>
                    {suggestion.status === "applied" ? "Applied" : "Dismissed"}
                  </Badge>
                  <p className="mt-1 text-xs text-muted">
                    {suggestion.decidedBy} ·{" "}
                    {suggestion.decidedAt ? formatDateTime(suggestion.decidedAt) : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
