"use client";

import {
  ActivityIcon,
  BuildingIcon,
  ChartColumnIcon,
  ClipboardListIcon,
  GiftIcon,
  LayoutDashboardIcon,
  LayoutTemplateIcon,
  MessageSquareQuoteIcon,
  PackageIcon,
  PercentIcon,
  ReceiptIcon,
  ScrollTextIcon,
  SearchIcon,
  SettingsIcon,
  SparklesIcon,
  TruckIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * One icon per section, keyed by the section id the layouts pass alongside the
 * translated label, so neither the store layout nor platform administration has
 * to hand an icon over.
 */
const ICONS: Record<string, LucideIcon> = {
  overview: LayoutDashboardIcon,
  catalog: PackageIcon,
  sourcing: SearchIcon,
  assistant: SparklesIcon,
  storefront: LayoutTemplateIcon,
  gifting: GiftIcon,
  analytics: ChartColumnIcon,
  orders: ClipboardListIcon,
  discounts: PercentIcon,
  team: UsersIcon,
  settings: SettingsIcon,
  activity: ActivityIcon,
  suppliers: TruckIcon,
  quotes: MessageSquareQuoteIcon,
  tax: ReceiptIcon,
  agencies: BuildingIcon,
  audit: ScrollTextIcon,
};

/**
 * The sections of a store, as underline tabs.
 *
 * Styled like shadcn's `line` tab list but built from real links rather than
 * Radix Tabs: each section is its own route, so navigation has to stay an
 * `<a href>` that works without JavaScript and that a crawler can follow.
 */
export function StoreNav({
  items,
  label,
}: {
  items: { href: string; label: string; section: string }[];
  /** The landmark's name, in the user's language. */
  label: string;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label={label} className="border-b border-border bg-background">
      <div className="mx-auto w-full max-w-[92rem] px-2 sm:px-6">
        <ul className="no-scrollbar -mb-px flex gap-1 overflow-x-auto">
          {items.map((item) => {
            const active =
              pathname === item.href ||
              (item.href.split("/").length > 4 && pathname.startsWith(`${item.href}/`));
            const Icon = ICONS[item.section];
            return (
              <li key={item.href} className="shrink-0">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={
                    active
                      ? "flex items-center gap-1.5 border-b-2 border-primary px-2.5 py-2.5 text-sm font-medium text-foreground"
                      : "flex items-center gap-1.5 border-b-2 border-transparent px-2.5 py-2.5 text-sm font-medium text-foreground/60 transition-colors hover:border-border hover:text-foreground"
                  }
                >
                  {Icon ? (
                    <Icon
                      aria-hidden
                      className={active ? "size-4 text-primary" : "size-4 text-muted-foreground"}
                    />
                  ) : null}
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
