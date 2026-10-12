/**
 * Notifications for store teams: which events notify, who receives them, how
 * each person wants them delivered, and when a batched email may go out.
 *
 * Everything here is pure, so `npm run notifications-check` exercises the access
 * filtering and the digest batching without a database. The writing and the
 * sending live in `lib/notify.ts`.
 */
import { resolveStoreRole } from "./store-access";
import type { Membership, Store, User } from "./types";

export const NOTIFICATION_TYPES = [
  "order_paid",
  "order_exception",
  "refund_recorded",
  "gift_approval",
  "quote_received",
  "invite_accepted",
  "low_stock",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Where one event type is delivered for one person. Both off means it is muted. */
export interface NotificationChannels {
  inApp: boolean;
  email: boolean;
}

export type NotificationPrefs = Partial<Record<NotificationType, NotificationChannels>>;

export const DEFAULT_NOTIFICATION_PREFS: Record<NotificationType, NotificationChannels> = {
  order_paid: { inApp: true, email: false },
  order_exception: { inApp: true, email: true },
  refund_recorded: { inApp: true, email: false },
  gift_approval: { inApp: true, email: true },
  quote_received: { inApp: true, email: false },
  invite_accepted: { inApp: true, email: false },
  low_stock: { inApp: true, email: true },
};

/** What the code that records an audit entry passes along when the entry should notify. */
export interface NotifyInput {
  type: NotificationType;
  /** The workspace page of the record, e.g. `/app/stores/str_x/orders/ord_y`. */
  href: string;
  /** Filled into the notification's wording: an order code, a person, an amount. */
  params?: NotificationParams;
}

export interface NotificationParams {
  code?: string;
  name?: string;
  amount?: number;
  currency?: string;
  /** Orders raised by a paid gift campaign. */
  count?: number;
}

export type EmailStatus = "none" | "pending" | "sent" | "skipped";

export interface Notification {
  id: string;
  userId: string;
  storeId: string;
  storeName: string;
  type: NotificationType;
  href: string;
  params: NotificationParams;
  /** Shown in the bell. False when the person only wants this type by email. */
  inApp: boolean;
  email: EmailStatus;
  createdAt: string;
  readAt: string | null;
}

export function isNotificationType(value: string): value is NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

/** A person's saved choices over the defaults, ignoring anything malformed. */
export function resolvePrefs(saved: NotificationPrefs | undefined | null): Record<NotificationType, NotificationChannels> {
  const out = { ...DEFAULT_NOTIFICATION_PREFS };
  for (const type of NOTIFICATION_TYPES) {
    const choice = saved?.[type];
    if (choice && typeof choice.inApp === "boolean" && typeof choice.email === "boolean") {
      out[type] = { inApp: choice.inApp, email: choice.email };
    }
  }
  return out;
}

/**
 * The people an event in `store` notifies: everyone on the store's team, that
 * is the agency's administrators and every active member, but never the person
 * who caused it. Platform administrators oversee stores without being on their
 * team, so they are left out.
 */
export function notificationRecipients(
  store: Pick<Store, "id" | "agencyId">,
  users: User[],
  memberships: Membership[],
  actorId: string,
): User[] {
  const seen = new Set<string>();
  return users.filter((user) => {
    if (seen.has(user.id) || user.id === actorId || user.platformRole === "platform_admin") return false;
    seen.add(user.id);
    const own = memberships.filter((m) => m.userId === user.id);
    return resolveStoreRole(user, store as Store, own) !== null;
  });
}

/** Only notifications about stores the reader can open now; access can be removed after the fact. */
export function visibleNotifications<T extends Pick<Notification, "storeId" | "inApp">>(
  notifications: T[],
  accessibleStoreIds: Iterable<string>,
): T[] {
  const allowed = new Set(accessibleStoreIds);
  return notifications.filter((n) => n.inApp && allowed.has(n.storeId));
}

/** The message a notification is worded with, under `notifications.titles`. */
export function notificationTitleKey(type: NotificationType, params: NotificationParams): NotificationType | "campaignPaid" {
  return type === "order_paid" && params.count ? "campaignPaid" : type;
}

/* ------------------------------------------------------------- digests */

/** New-order emails go out at most once per this long, per person and store. */
export const DIGEST_WINDOW_MS = 60 * 60 * 1000;

/** Whether a digest may go out now, given when the last one did. */
export function digestDue(lastSentAt: string | null | undefined, now: string): boolean {
  if (!lastSentAt) return true;
  return new Date(now).getTime() - new Date(lastSentAt).getTime() >= DIGEST_WINDOW_MS;
}

/**
 * The pending new-order notifications one digest carries: the unread ones,
 * oldest first. Anything already read in the app is not emailed again.
 */
export function digestBatch<T extends Pick<Notification, "email" | "readAt" | "createdAt">>(
  pending: T[],
): { send: T[]; skip: T[] } {
  const waiting = pending.filter((n) => n.email === "pending");
  return {
    send: waiting.filter((n) => !n.readAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    skip: waiting.filter((n) => n.readAt),
  };
}

/** Types whose emails are batched into an hourly digest rather than sent one by one. */
export function isDigestType(type: NotificationType): boolean {
  return type === "order_paid";
}

/** How many unread notifications the bell shows as a number before it reads "9+". */
export const UNREAD_BADGE_CAP = 9;

/** How many notifications the bell lists. */
export const NOTIFICATION_LIST_SIZE = 30;
