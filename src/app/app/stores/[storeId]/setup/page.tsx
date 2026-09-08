import { Callout, PageHeader, ProgressBar } from "@/components/ui";
import { listTaxBrackets } from "@/lib/data";
import { setupProgress } from "@/lib/metrics";
import { requireStoreAccess } from "@/lib/session";
import { SetupSections } from "./SetupSections";
import { StoreAdminPanel } from "./StoreAdminPanel";

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
  const progress = setupProgress(store.setup);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Everything about this store in one place: its name and client, whether it is live or archived, and the seven setup steps that take it from empty to able to sell."
      />

      {created ? (
        <Callout tone="green" title={`${store.name} is created`}>
          The store exists and is isolated from every other client. Work through the guided setup below —
          nothing is visible to shoppers until you publish a storefront layout.
        </Callout>
      ) : null}

      <StoreAdminPanel store={store} />

      <section className="space-y-4" id="guided-setup">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-ink">Guided setup</h2>
          <p className="mt-1 text-sm text-muted">
            Seven steps take a new store from empty to able to sell. Each one saves on its own, so you can
            leave and come back.
          </p>
        </div>

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
      </section>
    </div>
  );
}
