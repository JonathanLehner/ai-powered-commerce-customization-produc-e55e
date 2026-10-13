import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { requireStoreAccess } from "@/lib/session";
import { listImports } from "@/lib/shopify-import";
import { listRedirects } from "@/lib/url-redirects";
import { currencyDecimals } from "@/lib/util";
import { RedirectsCard } from "./RedirectsCard";
import { ShopifyImporter } from "./ShopifyImporter";

export default async function StoreImportPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const { store } = await requireStoreAccess(storeId, "store.settings");
  const [imports, redirects, t] = await Promise.all([
    listImports(store.id, 5),
    listRedirects(store.id),
    getTranslations("import"),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} />
      <ShopifyImporter
        storeId={store.id}
        currency={store.defaultCurrency}
        decimals={currencyDecimals(store.defaultCurrency)}
        recent={imports}
      />
      <RedirectsCard storeId={store.id} redirects={redirects} hasDomain={Boolean(store.customDomain)} />
    </div>
  );
}
