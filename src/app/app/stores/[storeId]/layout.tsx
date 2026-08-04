import { AppHeader } from "@/components/AppHeader";
import { StoreNav } from "@/components/StoreNav";
import { Badge } from "@/components/ui";
import { accessibleStores, requireStoreAccess, roleCan, type Capability } from "@/lib/session";
import { STORE_ROLE_LABELS } from "@/lib/types";

export default async function StoreLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const { user, store, role } = await requireStoreAccess(storeId);
  const stores = await accessibleStores(user);

  const base = `/app/stores/${store.id}`;
  const items: { href: string; label: string; capability: Capability }[] = [
    { href: base, label: "Overview", capability: "store.view" },
    { href: `${base}/catalog`, label: "Catalog", capability: "store.view" },
    { href: `${base}/sourcing`, label: "Sourcing", capability: "store.catalog" },
    { href: `${base}/assistant`, label: "AI assistant", capability: "store.catalog" },
    { href: `${base}/storefront`, label: "Storefront", capability: "store.storefront" },
    { href: `${base}/gifting`, label: "Gifting", capability: "store.gifting" },
    { href: `${base}/orders`, label: "Orders", capability: "store.view" },
    { href: `${base}/team`, label: "Team", capability: "store.team" },
    { href: `${base}/setup`, label: "Settings", capability: "store.settings" },
    { href: `${base}/activity`, label: "Activity", capability: "store.view" },
  ];

  return (
    <>
      <AppHeader user={user} stores={stores} currentStoreId={store.id} />
      <div className="border-b border-line bg-white">
        <div className="mx-auto flex w-full max-w-[92rem] flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-4 sm:px-6">
          <h1 className="text-lg font-semibold tracking-tight text-ink">{store.name}</h1>
          <span className="text-sm text-muted">{store.clientName}</span>
          <Badge tone={store.status === "active" ? "green" : "slate"}>
            {store.status === "active" ? "Active" : "Archived"}
          </Badge>
          <Badge tone="neutral">{STORE_ROLE_LABELS[role]}</Badge>
        </div>
      </div>
      <StoreNav items={items.filter((i) => roleCan(role, i.capability)).map(({ href, label }) => ({ href, label }))} />
      <div className="mx-auto w-full max-w-[92rem] flex-1 px-4 py-7 sm:px-6">{children}</div>
    </>
  );
}
