"use client";

import {
  BellIcon,
  EyeOffIcon,
  FileTextIcon,
  GiftIcon,
  PackageMinusIcon,
  ShoppingBagIcon,
  TriangleAlertIcon,
  Undo2Icon,
  UserCheckIcon,
  WebhookOffIcon,
  type LucideIcon,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import {
  loadNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationFeed,
} from "@/app/actions/notifications";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/components/ui/sonner";
import { formatAgo, formatMinorUnits } from "@/i18n/format";
import {
  notificationTitleKey,
  UNREAD_BADGE_CAP,
  type Notification,
  type NotificationType,
} from "@/lib/notifications";

const ICONS: Record<NotificationType, LucideIcon> = {
  order_paid: ShoppingBagIcon,
  order_exception: TriangleAlertIcon,
  refund_recorded: Undo2Icon,
  gift_approval: GiftIcon,
  quote_received: FileTextIcon,
  invite_accepted: UserCheckIcon,
  low_stock: PackageMinusIcon,
  webhook_disabled: WebhookOffIcon,
  product_unpublished: EyeOffIcon,
};

export function NotificationBell() {
  const t = useTranslations("notifications");
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const [feed, setFeed] = useState<NotificationFeed | null>(null);
  const [marking, startMarking] = useTransition();

  const refresh = useCallback(async () => {
    try {
      setFeed(await loadNotifications());
    } catch {
      toast.error(t("loadFailed"));
    }
  }, [t]);

  useEffect(() => {
    let live = true;
    loadNotifications()
      .then((next) => {
        if (live) setFeed(next);
      })
      .catch(() => toast.error(t("loadFailed")));
    return () => {
      live = false;
    };
  }, [t]);

  function toggle(next: boolean) {
    setOpen(next);
    if (next) void refresh();
  }

  function markAll() {
    if (marking) return;
    const now = new Date().toISOString();
    setFeed((current) =>
      current ? { unread: 0, items: current.items.map((n) => ({ ...n, readAt: n.readAt ?? now })) } : current,
    );
    startMarking(async () => {
      await markAllNotificationsRead();
    });
  }

  function openItem(item: Notification) {
    setOpen(false);
    if (item.readAt) return;
    setFeed((current) =>
      current
        ? {
            unread: Math.max(0, current.unread - 1),
            items: current.items.map((n) => (n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n)),
          }
        : current,
    );
    void markNotificationRead(item.id);
  }

  function title(item: Notification): string {
    const { code = "", name = "", count = 0, amount, currency } = item.params;
    return t(`titles.${notificationTitleKey(item.type, item.params)}`, {
      code,
      name,
      count,
      amount: typeof amount === "number" && currency ? formatMinorUnits(format, amount, currency) : "",
    });
  }

  const unread = feed?.unread ?? 0;
  const now = new Date();

  return (
    <Popover open={open} onOpenChange={toggle}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unread > 0 ? `${t("bell")}, ${t("unread", { count: unread })}` : t("bell")}
        >
          <BellIcon />
          {unread > 0 ? (
            <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground">
              {unread > UNREAD_BADGE_CAP ? `${UNREAD_BADGE_CAP}+` : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-1.5rem))] gap-0 p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <p className="font-medium text-foreground">{t("bell")}</p>
          <Button variant="ghost" size="sm" onClick={markAll} disabled={marking || unread === 0}>
            {t("markAllRead")}
          </Button>
        </div>
        {feed && feed.items.length > 0 ? (
          <ul className="max-h-[26rem] divide-y divide-border overflow-y-auto">
            {feed.items.map((item) => {
              const Icon = ICONS[item.type];
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    onClick={() => openItem(item)}
                    className="flex gap-3 px-3 py-2.5 outline-none hover:bg-muted focus-visible:bg-muted"
                  >
                    <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className={item.readAt ? "block text-muted-foreground" : "block font-medium text-foreground"}>
                        {title(item)}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {item.storeName} · {formatAgo(format, item.createdAt, now)}
                      </span>
                    </span>
                    {item.readAt ? null : <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-hidden />}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          feed ? (
            <p className="px-3 py-8 text-center text-muted-foreground">{t("empty")}</p>
          ) : (
            <div className="space-y-3 px-3 py-3">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          )
        )}
      </PopoverContent>
    </Popover>
  );
}
