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

  const [pages, t] = await Promise.all([getTranslations("pages.store"), getTranslations("settings")]);
  return (
    <div className="space-y-6">
      <PageHeader
        title={pages("settingsTitle")}
      />

      {created ? (
        <Callout tone="green" title={t("createdTitle", { name: store.name })}>
          {t("createdBody")}
        </Callout>
      ) : null}

      <StoreAdminPanel store={store} />

      <section className="space-y-4" id="guided-setup">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">{t("guidedSetup")}</h2>
        </div>

        <Card>
          <CardContent>
            <ProgressBar
              value={progress.pct}
              label={t("progress", { done: progress.done, total: progress.total })}
            />
            {progress.pct === 100 ? (
              <p className="mt-3 text-sm text-emerald-700">
                {t("complete")}
              </p>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">{t("startSelling")}</p>
            )}
          </CardContent>
        </Card>

        <SetupSections store={store} brackets={brackets} />
      </section>
    </div>
  );
}
