import { getTranslations } from "next-intl/server";
import { Callout, PageHeader, ProgressBar } from "@/components/ui";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { storeLanguages } from "@/i18n/storefront-routing";
import { listTaxBrackets } from "@/lib/data";
import { POLICY_KEYS } from "@/lib/policies";
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
  // The built-in policy text in each of the store's languages, so the editor
  // starts from what shoppers read today.
  const policyDefaults = Object.fromEntries(
    await Promise.all(
      storeLanguages(store).locales.map(async (locale) => {
        const builtIn = await getTranslations({ locale, namespace: "storePolicies" });
        return [locale, Object.fromEntries(POLICY_KEYS.map((key) => [key, builtIn(key, { store: store.name })]))];
      }),
    ),
  );

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

      <Card asChild>
        <section>
          <CardHeader>
            <CardTitle asChild>
              <h2>{t("apiKeysTitle")}</h2>
            </CardTitle>
            <p className="text-sm text-muted-foreground">{t("apiKeysBody")}</p>
            <CardAction>
              <Link href={`/app/stores/${store.id}/setup/api-keys`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                {t("apiKeysLink")}
              </Link>
            </CardAction>
          </CardHeader>
        </section>
      </Card>

      <Card asChild>
        <section>
          <CardHeader>
            <CardTitle asChild>
              <h2>{t("webhooksTitle")}</h2>
            </CardTitle>
            <p className="text-sm text-muted-foreground">{t("webhooksBody")}</p>
            <CardAction>
              <Link href={`/app/stores/${store.id}/setup/webhooks`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                {t("webhooksLink")}
              </Link>
            </CardAction>
          </CardHeader>
        </section>
      </Card>

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

        <SetupSections store={store} brackets={brackets} policyDefaults={policyDefaults} />
      </section>
    </div>
  );
}
