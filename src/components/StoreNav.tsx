"use client";

import {
  ActivityIcon,
  BuildingIcon,
  ChartColumnIcon,
  ChevronDownIcon,
  ClipboardListIcon,
  CreditCardIcon,
  FileTextIcon,
  GiftIcon,
  GlobeIcon,
  KeyRoundIcon,
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
  StarIcon,
  TruckIcon,
  UploadIcon,
  UserRoundIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

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
  content: FileTextIcon,
  reviews: StarIcon,
  giftCards: CreditCardIcon,
  gifting: GiftIcon,
  analytics: ChartColumnIcon,
  orders: ClipboardListIcon,
  customers: UserRoundIcon,
  discounts: PercentIcon,
  shipping: TruckIcon,
  domains: GlobeIcon,
  import: UploadIcon,
  team: UsersIcon,
  settings: SettingsIcon,
  activity: ActivityIcon,
  suppliers: TruckIcon,
  quotes: MessageSquareQuoteIcon,
  tax: ReceiptIcon,
  agencies: BuildingIcon,
  audit: ScrollTextIcon,
  apiKeys: KeyRoundIcon,
};

type NavItem = { href: string; label: string; section: string; group?: string };
type Entry = { kind: "link"; item: NavItem } | { kind: "group"; id: string; label: string; items: NavItem[] };

const TAB =
  "flex items-center gap-1.5 border-b-2 px-2.5 py-2.5 text-sm font-medium transition-colors cursor-pointer list-none [&::-webkit-details-marker]:hidden";
const TAB_ACTIVE = "border-primary text-foreground";
const TAB_IDLE = "border-transparent text-foreground/60 hover:border-border hover:text-foreground";
const PANEL =
  "absolute top-full z-30 mt-1 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10";

/**
 * Items in order, with each group gathered at the place its first item appears.
 * A group left with one item (say after role filtering) shows as a plain tab.
 */
function toEntries(items: NavItem[], groups: Record<string, string>): Entry[] {
  const entries: Entry[] = [];
  const byId = new Map<string, Extract<Entry, { kind: "group" }>>();
  for (const item of items) {
    if (!item.group) {
      entries.push({ kind: "link", item });
      continue;
    }
    let group = byId.get(item.group);
    if (!group) {
      group = { kind: "group", id: item.group, label: groups[item.group] ?? item.group, items: [] };
      byId.set(item.group, group);
      entries.push(group);
    }
    group.items.push(item);
  }
  return entries.map((e) => (e.kind === "group" && e.items.length === 1 ? { kind: "link", item: e.items[0] } : e));
}

function MenuLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = ICONS[item.section];
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "flex items-center gap-2 rounded-md bg-accent px-2 py-1.5 text-sm font-medium text-foreground"
          : "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/80 hover:bg-accent hover:text-foreground"
      }
    >
      {Icon ? <Icon aria-hidden className={active ? "size-4 text-primary" : "size-4 text-muted-foreground"} /> : null}
      {item.label}
    </Link>
  );
}

/**
 * The sections of a store (or of platform administration) as underline tabs,
 * with related sections gathered into labelled menus so every section fits
 * without sideways scrolling. Below `lg` the whole list collapses into one
 * menu named after the current section.
 *
 * Menus are `<details>` elements holding real links rather than Radix menus:
 * each section is its own route, so navigation has to stay an `<a href>` that
 * works without JavaScript and that a crawler can follow. Script only closes
 * open menus on navigation, outside clicks and Escape.
 *
 * To add a section, give its item a `group` id; to add a group, add its label
 * to `groups`.
 */
export function StoreNav({
  items,
  groups = {},
  label,
}: {
  items: NavItem[];
  /** Group id -> translated menu label. */
  groups?: Record<string, string>;
  /** The landmark's name, in the user's language. */
  label: string;
}) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);

  const isActive = (href: string) =>
    pathname === href || (href.split("/").length > 4 && pathname.startsWith(`${href}/`));
  const entries = toEntries(items, groups);
  const current = items.find((i) => isActive(i.href));
  const CurrentIcon = current ? ICONS[current.section] : undefined;

  useEffect(() => {
    navRef.current?.querySelectorAll("details[open]").forEach((d) => d.removeAttribute("open"));
  }, [pathname]);

  useEffect(() => {
    const closeAll = (except?: Element | null) =>
      navRef.current?.querySelectorAll("details[open]").forEach((d) => d !== except && d.removeAttribute("open"));
    const onPointer = (e: PointerEvent) => closeAll((e.target as Element).closest?.("details"));
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const open = navRef.current?.querySelector<HTMLDetailsElement>("details[open]");
      if (!open) return;
      open.removeAttribute("open");
      open.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <nav ref={navRef} aria-label={label} className="border-b border-border bg-background">
      <div className="relative mx-auto w-full max-w-[92rem] px-2 sm:px-6">
        {/* Narrow screens: one menu with every section. */}
        <details className="-mb-px lg:hidden">
          <summary className={`${TAB} ${TAB_ACTIVE} w-fit`}>
            {CurrentIcon ? <CurrentIcon aria-hidden className="size-4 text-primary" /> : null}
            {current?.label ?? label}
            <ChevronDownIcon aria-hidden className="size-4 text-muted-foreground" />
          </summary>
          <div className={`${PANEL} inset-x-2 max-h-[70vh] overflow-y-auto sm:right-auto sm:left-6 sm:w-72`}>
            {entries.map((entry) =>
              entry.kind === "link" ? (
                <MenuLink key={entry.item.href} item={entry.item} active={isActive(entry.item.href)} />
              ) : (
                <div key={entry.id} className="mt-1 border-t border-border pt-1">
                  <p className="px-2 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">{entry.label}</p>
                  <ul>
                    {entry.items.map((item) => (
                      <li key={item.href}>
                        <MenuLink item={item} active={isActive(item.href)} />
                      </li>
                    ))}
                  </ul>
                </div>
              ),
            )}
          </div>
        </details>

        {/* Wide screens: tabs and labelled menus. */}
        <ul className="-mb-px hidden gap-1 lg:flex">
          {entries.map((entry) => {
            if (entry.kind === "link") {
              const active = isActive(entry.item.href);
              const Icon = ICONS[entry.item.section];
              return (
                <li key={entry.item.href}>
                  <Link
                    href={entry.item.href}
                    aria-current={active ? "page" : undefined}
                    className={`${TAB} ${active ? TAB_ACTIVE : TAB_IDLE}`}
                  >
                    {Icon ? (
                      <Icon aria-hidden className={active ? "size-4 text-primary" : "size-4 text-muted-foreground"} />
                    ) : null}
                    {entry.item.label}
                  </Link>
                </li>
              );
            }
            const activeItem = entry.items.find((i) => isActive(i.href));
            return (
              <li key={entry.id} className="relative">
                <details>
                  <summary className={`${TAB} ${activeItem ? TAB_ACTIVE : TAB_IDLE}`}>
                    {entry.label}
                    {activeItem ? (
                      <span className="font-normal text-muted-foreground">· {activeItem.label}</span>
                    ) : null}
                    <ChevronDownIcon aria-hidden className="size-4 text-muted-foreground" />
                  </summary>
                  <ul className={`${PANEL} left-0 w-60`}>
                    {entry.items.map((item) => (
                      <li key={item.href}>
                        <MenuLink item={item} active={isActive(item.href)} />
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
