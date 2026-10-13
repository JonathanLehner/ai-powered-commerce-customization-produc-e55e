import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Orders and Abandoned checkouts. Drawn like the shadcn tab list but made of
 * links, because each view is its own route.
 */
export async function OrdersTabs({ storeId, active }: { storeId: string; active: "orders" | "abandoned" }) {
  const t = await getTranslations("abandoned");
  const base = `/app/stores/${storeId}/orders`;
  const tabs = [
    { key: "orders", href: base, label: t("tabOrders") },
    { key: "abandoned", href: `${base}/abandoned`, label: t("tabAbandoned") },
  ] as const;
  return (
    <nav aria-label={t("tabsLabel")}>
      <ul className="inline-flex h-9 w-fit items-center rounded-lg bg-muted p-[3px] text-muted-foreground">
        {tabs.map((tab) => (
          <li key={tab.key} className="h-full">
            <Link
              href={tab.href}
              aria-current={tab.key === active ? "page" : undefined}
              className={cn(
                "inline-flex h-full items-center rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                tab.key === active ? "bg-background text-foreground shadow-sm" : "text-foreground/60 hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
