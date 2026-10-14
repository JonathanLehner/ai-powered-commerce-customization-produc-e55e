import "server-only";
import { COLLECTIONS, updateUser } from "./data";
import { db } from "./mongo";
import {
  NOTIFICATION_LIST_SIZE,
  NOTIFICATION_TYPES,
  resolvePrefs,
  visibleNotifications,
  type Notification,
  type NotificationPrefs,
} from "./notifications";

/**
 * A person's notification inbox: the bell in the workspace and the Admin API's
 * notification operations read and change it through these, limited to the
 * stores the caller may see (all of a person's team stores in the workspace,
 * the key's own store through the API).
 */

export interface NotificationFeed {
  items: Notification[];
  unread: number;
}

export async function notificationFeed(userId: string, storeIds: string[], limit = NOTIFICATION_LIST_SIZE): Promise<NotificationFeed> {
  if (storeIds.length === 0) return { items: [], unread: 0 };
  const scope = { userId, inApp: true, storeId: { $in: storeIds } };
  const [rows, unread] = await Promise.all([
    db.find<Notification>(COLLECTIONS.notifications, scope, { sort: { createdAt: -1 }, limit }),
    db.count(COLLECTIONS.notifications, { ...scope, readAt: null }),
  ]);
  return { items: visibleNotifications(rows, storeIds), unread };
}

/** Marks one notification read. Repeating it changes nothing. False when it is not the person's. */
export async function markRead(userId: string, id: string, storeIds?: string[]): Promise<boolean> {
  const filter = { id, userId, ...(storeIds ? { storeId: { $in: storeIds } } : {}) };
  const found = await db.findOne<Notification>(COLLECTIONS.notifications, filter);
  if (!found) return false;
  if (!found.readAt) {
    await db.updateOne(COLLECTIONS.notifications, { ...filter, readAt: null }, { $set: { readAt: new Date().toISOString() } });
  }
  return true;
}

/** Marks every unread notification read, in the given stores or everywhere. Returns how many. */
export async function markAllRead(userId: string, storeIds?: string[]): Promise<number> {
  const result = await db.updateMany(
    COLLECTIONS.notifications,
    { userId, readAt: null, ...(storeIds ? { storeId: { $in: storeIds } } : {}) },
    { $set: { readAt: new Date().toISOString() } },
  );
  return result.modifiedCount;
}

/** Saves where each event type goes. Only known types and true/false values are kept. */
export async function savePrefs(userId: string, prefs: NotificationPrefs) {
  const clean = resolvePrefs(prefs);
  const saved: NotificationPrefs = {};
  for (const type of NOTIFICATION_TYPES) saved[type] = clean[type];
  await updateUser(userId, { notificationPrefs: saved });
  return clean;
}
