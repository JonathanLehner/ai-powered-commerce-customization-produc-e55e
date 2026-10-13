import type { Messages } from "next-intl";
import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/AppHeader";
import { StoreNav } from "@/components/StoreNav";
import { Badge } from "@/components/ui";
import { accessibleStores, requireStoreAccess, roleCan, type Capability } from "@/lib/session";


export default async function StoreLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const { user, store, role, viaPlatform } = await requireStoreAccess(storeId);
  const [stores, t, roles] = await Promise.all([
    accessibleStores(user),
    getTranslations("shell"),
    getTranslations("roles"),
  ]);

  const base = `/app/stores/${store.id}`;
  const items: { href: string; section: keyof Messages["shell"]["tabs"]; capability: Capability }[] = [
    { href: base, section: "overview", capability: "store.view" },
    { href: `${base}/catalog`, section: "catalog", capability: "store.view" },
    { href: `${base}/sourcing`, section: "sourcing", capability: "store.catalog" },
    { href: `${base}/assistant`, section: "assistant", capability: "store.catalog" },
    { href: `${base}/storefront`, section: "storefront", capability: "store.storefront" },
    { href: `${base}/content`, section: "content", capability: "store.storefront" },
    { href: `${base}/gifting`, section: "gifting", capability: "store.gifting" },
    { href: `${base}/orders`, section: "orders", capability: "store.view" },
    { href: `${base}/customers`, section: "customers", capability: "store.orders" },
    { href: `${base}/analytics`, section: "analytics", capability: "store.view" },
    { href: `${base}/reviews`, section: "reviews", capability: "store.view" },
    { href: `${base}/discounts`, section: "discounts", capability: "store.settings" },
    { href: `${base}/gift-cards`, section: "giftCards", capability: "store.settings" },
    { href: `${base}/shipping`, section: "shipping", capability: "store.settings" },
    { href: `${base}/team`, section: "team", capability: "store.team" },
    { href: `${base}/domains`, section: "domains", capability: "store.settings" },
    { href: `${base}/import`, section: "import", capability: "store.settings" },
    { href: `${base}/setup`, section: "settings", capability: "store.settings" },
    { href: `${base}/activity`, section: "activity", capability: "store.view" },
  ];

  return (
    <>
      <AppHeader user={user} stores={stores} currentStoreId={store.id} />
      <div className="border-b border-border bg-background">
        <div className="mx-auto flex w-full max-w-[92rem] flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-4 sm:px-6">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">{store.name}</h1>
          <span className="text-sm text-muted-foreground">{store.clientName}</span>
          <Badge tone={store.status === "active" ? "green" : "slate"}>
            {store.status === "active" ? t("active") : t("archived")}
          </Badge>
          <Badge tone={viaPlatform ? "iris" : "neutral"}>{viaPlatform ? roles("platformAccess") : roles(role)}</Badge>
        </div>
        {viaPlatform ? (
          <p className="mx-auto w-full max-w-[92rem] px-4 pt-2 text-xs text-muted-foreground sm:px-6">
            {roles("platformAccessNote")}
          </p>
        ) : null}
      </div>
      <StoreNav
        label={t("storeSections")}
        items={items
          .filter((i) => roleCan(role, i.capability))
          .map(({ href, section }) => ({ href, section, label: t(`tabs.${section}`) }))}
      />
      <div className="mx-auto w-full max-w-[92rem] flex-1 px-4 py-7 sm:px-6">{children}</div>
    </>
  );
}
