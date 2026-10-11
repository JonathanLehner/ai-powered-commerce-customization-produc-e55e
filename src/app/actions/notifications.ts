"use server";

import { after } from "next/server";
import { COLLECTIONS, updateUser } from "@/lib/data";
import { siteOrigin } from "@/lib/email";
import { db } from "@/lib/mongo";
import {
  NOTIFICATION_LIST_SIZE,
  NOTIFICATION_TYPES,
  resolvePrefs,
  visibleNotifications,
  type Notification,
  type NotificationPrefs,
} from "@/lib/notifications";
import { flushUserDigests } from "@/lib/notify";
import { accessibleStores, getSessionUser } from "@/lib/session";
import type { User } from "@/lib/types";

export interface NotificationFeed {
  items: Notification[];
  unread: number;
}

/** The stores the reader is on the team of. Platform oversight does not count. */
async function teamStoreIds(user: User): Promise<string[]> {
  return (await accessibleStores(user)).filter((s) => !s.viaPlatform).map((s) => s.store.id);
}

/** The bell's list and unread count, limited to stores the reader can open now. */
export async function loadNotifications(): Promise<NotificationFeed> {
  const user = await getSessionUser();
  if (!user) return { items: [], unread: 0 };
  const storeIds = await teamStoreIds(user);
  if (storeIds.length === 0) return { items: [], unread: 0 };

  const scope = { userId: user.id, inApp: true, storeId: { $in: storeIds } };
  const [rows, unread] = await Promise.all([
    db.find<Notification>(COLLECTIONS.notifications, scope, {
      sort: { createdAt: -1 },
      limit: NOTIFICATION_LIST_SIZE,
    }),
    db.count(COLLECTIONS.notifications, { ...scope, readAt: null }),
  ]);

  // New-order emails held back for the hourly digest go out once the hour is up.
  const origin = await siteOrigin();
  after(() => flushUserDigests(user.id, origin).catch((error) => console.error("Digest could not be sent", error)));

  return { items: visibleNotifications(rows, storeIds), unread };
}

/** Marks one notification read. Repeating it changes nothing. */
export async function markNotificationRead(id: string): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  await db.updateOne(
    COLLECTIONS.notifications,
    { id, userId: user.id, readAt: null },
    { $set: { readAt: new Date().toISOString() } },
  );
}

export async function markAllNotificationsRead(): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  await db.updateMany(
    COLLECTIONS.notifications,
    { userId: user.id, readAt: null },
    { $set: { readAt: new Date().toISOString() } },
  );
}

/** Saves where each event type goes. Only known types and true/false values are kept. */
export async function saveNotificationPrefs(prefs: NotificationPrefs): Promise<{ ok: boolean }> {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  const clean = resolvePrefs(prefs);
  const saved: NotificationPrefs = {};
  for (const type of NOTIFICATION_TYPES) saved[type] = clean[type];
  await updateUser(user.id, { notificationPrefs: saved });
  return { ok: true };
}
