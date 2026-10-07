import { Badge, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { listDiscountCodes } from "@/lib/data";
import { isExpired } from "@/lib/discounts";
import { requireStoreAccess } from "@/lib/session";
import type { DiscountCode } from "@/lib/types";
import { formatDate, formatMoney } from "@/lib/util";
import { DiscountCreateForm, DiscountEditForm } from "./DiscountForms";

/** The one-line state of a code: why it is or is not working right now. */
function codeState(code: DiscountCode): { label: string; tone: "green" | "amber" | "slate" | "rose" } {
  if (!code.active) return { label: "Inactive", tone: "slate" };
  if (isExpired(code)) return { label: "Expired", tone: "rose" };
  if (code.usageLimit !== null && code.timesUsed >= code.usageLimit) {
    return { label: "Limit reached", tone: "amber" };
  }
  return { label: "Live", tone: "green" };
}

function worth(code: DiscountCode): string {
  return code.kind === "percentage"
    ? `${code.value}% off`
    : `${formatMoney(code.value, code.currency)} off`;
}

export default async function DiscountsPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const { store } = await requireStoreAccess(storeId, "store.settings");
  const codes = await listDiscountCodes(storeId);

  const live = codes.filter((code) => codeState(code).label === "Live");
  const redemptions = codes.reduce((sum, code) => sum + (code.timesUsed ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Discount codes"
        description="Codes shoppers enter in the basket or at checkout. Each one takes a percentage or a fixed amount off the goods, and can carry a minimum basket, an expiry date and a cap on how many times it may be used."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Codes" value={String(codes.length)} sub={`${live.length} working right now`} />
        <StatCard label="Redemptions" value={String(redemptions)} sub="Across every code" />
        <StatCard
          label="Stated in"
          value={store.defaultCurrency}
          sub="Fixed amounts are converted at checkout"
        />
      </div>

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-ink">Codes</h2>
        {codes.length === 0 ? (
          <EmptyState
            title="No discount codes yet"
            description="Create one below. A code works the moment it is active, and shoppers enter it themselves in the basket or at checkout — the discount is checked again when the card is charged."
          />
        ) : (
          <ul className="space-y-4">
            {codes.map((code) => {
              const state = codeState(code);
              return (
                <li key={code.id} className="card p-5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-mono text-sm font-semibold text-ink">{code.code}</span>
                    <Badge tone={state.tone}>{state.label}</Badge>
                    <span className="text-sm text-inksoft">{worth(code)}</span>
                    <span className="text-xs text-muted-foreground">
                      {code.minimumSubtotal > 0
                        ? `Minimum ${formatMoney(code.minimumSubtotal, code.currency)} · `
                        : ""}
                      {code.expiresAt ? `Expires ${formatDate(code.expiresAt)} · ` : ""}
                      {code.timesUsed ?? 0}
                      {code.usageLimit === null ? " used, no limit" : ` of ${code.usageLimit} used`}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Created by {code.createdBy} on {formatDate(code.createdAt)}
                  </p>
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm font-medium text-brand-700">
                      Edit {code.code}
                    </summary>
                    <div className="mt-3 border-t border-line pt-4">
                      <DiscountEditForm code={code} />
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-ink">Create a code</h2>
        <DiscountCreateForm storeId={storeId} currency={store.defaultCurrency} />
      </section>
    </div>
  );
}
