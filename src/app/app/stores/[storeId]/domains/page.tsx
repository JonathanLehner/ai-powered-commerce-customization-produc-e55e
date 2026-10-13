import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { cnameTarget, saasConfig } from "@/lib/cloudflare-saas";
import { listDomains } from "@/lib/operations/domains";
import { requireStoreAccess } from "@/lib/session";
import { DomainsManager } from "./DomainsManager";

export default async function StoreDomainsPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const { store } = await requireStoreAccess(storeId, "store.settings");
  const [domains, t] = await Promise.all([listDomains(store.id), getTranslations("domains")]);
  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} />
      <DomainsManager
        storeId={store.id}
        slug={store.slug}
        domains={domains}
        target={cnameTarget()}
        setupPending={saasConfig() === null}
        suggested={domains.length === 0 ? store.customDomain : null}
      />
    </div>
  );
}
