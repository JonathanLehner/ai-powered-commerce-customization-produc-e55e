"use server";

import { after } from "next/server";
import { siteOrigin } from "@/lib/email";
import { markAllRead, markRead, notificationFeed, savePrefs, type NotificationFeed } from "@/lib/notification-inbox";
import type { NotificationPrefs } from "@/lib/notifications";
import { flushUserDigests } from "@/lib/notify";
import { accessibleStores, getSessionUser } from "@/lib/session";
import type { User } from "@/lib/types";

export type { NotificationFeed } from "@/lib/notification-inbox";

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
  const feed = await notificationFeed(user.id, storeIds);

  // New-order emails held back for the hourly digest go out once the hour is up.
  const origin = await siteOrigin();
  after(() => flushUserDigests(user.id, origin).catch((error) => console.error("Digest could not be sent", error)));

  return feed;
}

/** Marks one notification read. Repeating it changes nothing. */
export async function markNotificationRead(id: string): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  await markRead(user.id, id);
}

export async function markAllNotificationsRead(): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  await markAllRead(user.id);
}

/** Saves where each event type goes. Only known types and true/false values are kept. */
export async function saveNotificationPrefs(prefs: NotificationPrefs): Promise<{ ok: boolean }> {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  await savePrefs(user.id, prefs);
  return { ok: true };
}
