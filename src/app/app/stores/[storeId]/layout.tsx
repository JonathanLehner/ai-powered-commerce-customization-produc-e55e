import type { Messages } from "next-intl";
import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/AppHeader";
import { ClientMessages } from "@/components/ClientMessages";
import { StoreNav } from "@/components/StoreNav";
import { Badge } from "@/components/ui";
import { accessibleStores, requireStoreAccess, roleCan, type Capability } from "@/lib/session";
import { kickScheduler } from "@/lib/scheduler";


export default async function StoreLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const { user, store, role, viaPlatform } = await requireStoreAccess(storeId);
  kickScheduler();
  const [stores, t, roles] = await Promise.all([
    accessibleStores(user),
    getTranslations("shell"),
    getTranslations("roles"),
  ]);

  const base = `/app/stores/${store.id}`;
  // Sections in display order; `group` places one in a menu (labels under shell.tabGroups).
  const items: {
    href: string;
    section: keyof Messages["shell"]["tabs"];
    group?: keyof Messages["shell"]["tabGroups"];
    capability: Capability;
  }[] = [
    { href: base, section: "overview", capability: "store.view" },
    { href: `${base}/catalog`, section: "catalog", group: "products", capability: "store.view" },
    { href: `${base}/sourcing`, section: "sourcing", group: "products", capability: "store.catalog" },
    { href: `${base}/assistant`, section: "assistant", group: "products", capability: "store.catalog" },
    { href: `${base}/import`, section: "import", group: "products", capability: "store.settings" },
    { href: `${base}/reviews`, section: "reviews", group: "products", capability: "store.view" },
    { href: `${base}/storefront`, section: "storefront", group: "selling", capability: "store.storefront" },
    { href: `${base}/content`, section: "content", group: "selling", capability: "store.storefront" },
    { href: `${base}/discounts`, section: "discounts", group: "selling", capability: "store.settings" },
    { href: `${base}/gift-cards`, section: "giftCards", group: "selling", capability: "store.settings" },
    { href: `${base}/gifting`, section: "gifting", group: "selling", capability: "store.gifting" },
    { href: `${base}/orders`, section: "orders", group: "orders", capability: "store.view" },
    { href: `${base}/customers`, section: "customers", group: "orders", capability: "store.orders" },
    { href: `${base}/analytics`, section: "analytics", group: "orders", capability: "store.view" },
    { href: `${base}/setup`, section: "settings", group: "settings", capability: "store.settings" },
    { href: `${base}/team`, section: "team", group: "settings", capability: "store.team" },
    { href: `${base}/shipping`, section: "shipping", group: "settings", capability: "store.settings" },
    { href: `${base}/domains`, section: "domains", group: "settings", capability: "store.settings" },
    { href: `${base}/activity`, section: "activity", group: "settings", capability: "store.view" },
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
        groups={{
          products: t("tabGroups.products"),
          selling: t("tabGroups.selling"),
          orders: t("tabGroups.orders"),
          settings: t("tabGroups.settings"),
        }}
        items={items
          .filter((i) => roleCan(role, i.capability))
          .map(({ href, section, group }) => ({ href, section, group, label: t(`tabs.${section}`) }))}
      />
      <div className="mx-auto w-full max-w-[92rem] flex-1 px-4 py-7 sm:px-6">
        {/* The overview's messages; each section's layout replaces them with its own. */}
        <ClientMessages section="overview">{children}</ClientMessages>
      </div>
    </>
  );
}
