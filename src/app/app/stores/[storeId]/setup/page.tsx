import { getTranslations } from "next-intl/server";
import { Callout, PageHeader, ProgressBar } from "@/components/ui";
import { Card, CardContent } from "@/components/ui/card";
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

  const pages = await getTranslations("pages.store");
  return (
    <div className="space-y-6">
      <PageHeader
        title={pages("settingsTitle")}
      />

      {created ? (
        <Callout tone="green" title={`${store.name} is created`}>
          Complete the setup steps below.
        </Callout>
      ) : null}

      <StoreAdminPanel store={store} />

      <section className="space-y-4" id="guided-setup">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Guided setup</h2>
        </div>

        <Card>
          <CardContent>
            <ProgressBar
              value={progress.pct}
              label={`Setup progress: ${progress.done} of ${progress.total} steps`}
            />
            {progress.pct === 100 ? (
              <p className="mt-3 text-sm text-emerald-700">
                Setup complete
              </p>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">Connect payments and a carrier to start selling.</p>
            )}
          </CardContent>
        </Card>

        <SetupSections store={store} brackets={brackets} />
      </section>
    </div>
  );
}
