import { Callout, PageHeader, ProgressBar } from "@/components/ui";
import { listTaxBrackets } from "@/lib/data";
import { setupProgress } from "@/lib/metrics";
import { requireStoreAccess } from "@/lib/session";
import { SetupSections } from "./SetupSections";

export default async function StoreSetupPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { storeId } = await params;
  const { created } = await searchParams;
  const { store } = await requireStoreAccess(storeId, "store.settings");
  const brackets = await listTaxBrackets();
  const progress = setupProgress(store.setup as unknown as Record<string, boolean>);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Store settings"
        title="Guided setup"
        description="Six steps take a new store from empty to able to sell. Each one saves on its own, so you can leave and come back."
      />

      {created ? (
        <Callout tone="green" title={`${store.name} is created`}>
          The store exists and is isolated from every other client. Work through the steps below — nothing is
          visible to shoppers until you publish a storefront layout.
        </Callout>
      ) : null}

      <div className="card p-5">
        <ProgressBar value={progress.pct} label={`Setup progress — ${progress.done} of ${progress.total} steps`} />
        {progress.pct === 100 ? (
          <p className="mt-3 text-sm text-emerald-700">
            ✓ Everything is configured. This store can take orders and route them to production.
          </p>
        ) : (
          <p className="mt-3 text-sm text-muted">
            Payments and shipping are the two that block selling — a shopper cannot check out until Stripe is
            connected and at least one carrier is enabled.
          </p>
        )}
      </div>

      <SetupSections store={store} brackets={brackets} />
    </div>
  );
}
