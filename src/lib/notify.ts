import "server-only";
import { getFormatter, getTranslations } from "next-intl/server";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/locales";
import { emailCopy } from "@/i18n/storefront";
import { formatMinorUnits } from "@/i18n/format";
import { COLLECTIONS, getStore, listMemberships } from "./data";
import { sendEmail } from "./email";
import { brandFor, notificationEmail } from "./email-templates";
import { db } from "./mongo";
import {
  digestBatch,
  DIGEST_WINDOW_MS,
  isDigestType,
  notificationRecipients,
  notificationTitleKey,
  resolvePrefs,
  type Notification,
  type NotificationParams,
  type NotifyInput,
} from "./notifications";
import type { AuditLog, Membership, Store, User } from "./types";
import { newId } from "./util";

/**
 * Turns an audit entry into notifications for the store's team. Called by
 * `recordAudit` for the entries that ask for it, so every event is recorded in
 * one place and notified from the same call.
 */
export async function notifyFromAudit(entry: AuditLog, input: NotifyInput, origin: string): Promise<void> {
  if (!entry.storeId) return;
  const store = await getStore(entry.storeId);
  if (!store) return;
  const { users, memberships } = await storeTeam(store);
  const recipients = notificationRecipients(store, users, memberships, entry.actorId);

  const now = entry.at;
  const created: { user: User; notification: Notification }[] = [];
  for (const user of recipients) {
    const channels = resolvePrefs(user.notificationPrefs)[input.type];
    if (!channels.inApp && !channels.email) continue;
    created.push({
      user,
      notification: {
        id: newId("ntf"),
        userId: user.id,
        storeId: store.id,
        storeName: store.name,
        type: input.type,
        href: input.href,
        params: input.params ?? {},
        inApp: channels.inApp,
        email: channels.email ? (isDigestType(input.type) ? "pending" : "sent") : "none",
        createdAt: now,
        readAt: null,
      },
    });
  }
  if (created.length > 0) {
    await db.insertMany(
      COLLECTIONS.notifications,
      created.map(({ notification }) => notification as unknown as Record<string, unknown>),
    );
  }

  for (const { user, notification } of created) {
    if (notification.email === "sent") await emailOne(user, store, notification, origin);
  }
  // Anyone in this store with new-order emails waiting, including the ones just
  // written, gets their digest if the hour since the last one has passed.
  await flushStoreDigests(store, origin);
}

/** The agency's administrators and every active member of the store, with their accounts. */
async function storeTeam(store: Store): Promise<{ users: User[]; memberships: Membership[] }> {
  const memberships = (await listMemberships(store.id)).filter((m) => m.status === "active" && m.userId);
  const [members, admins] = await Promise.all([
    db.findIn<User>(COLLECTIONS.users, "id", memberships.map((m) => m.userId as string)),
    db.find<User>(COLLECTIONS.users, { agencyId: store.agencyId, platformRole: "agency_admin" }),
  ]);
  return { users: [...admins, ...members], memberships };
}

/* -------------------------------------------------------------- digests */

/** Sends every digest in a store that is due. */
export async function flushStoreDigests(store: Store, origin: string): Promise<void> {
  const pending = await db.find<Notification>(COLLECTIONS.notifications, { storeId: store.id, email: "pending" });
  if (pending.length === 0) return;
  // Access is checked again here: someone removed from the team since the order
  // came in is not emailed about it.
  const { users, memberships } = await storeTeam(store);
  const team = new Map(notificationRecipients(store, users, memberships, "").map((u) => [u.id, u]));
  const byUser = new Map<string, Notification[]>();
  for (const n of pending) byUser.set(n.userId, [...(byUser.get(n.userId) ?? []), n]);
  for (const [userId, rows] of byUser) {
    const user = team.get(userId);
    if (!user) {
      await markEmail(rows, "skipped");
      continue;
    }
    await flushDigest(user, store, rows, origin);
  }
}

/** Sends the due digests for one person across their stores, e.g. when they open the workspace. */
export async function flushUserDigests(userId: string, origin: string): Promise<void> {
  const pending = await db.find<Notification>(COLLECTIONS.notifications, { userId, email: "pending" });
  const storeIds = [...new Set(pending.map((n) => n.storeId))];
  for (const storeId of storeIds) {
    const store = await getStore(storeId);
    if (store) await flushStoreDigests(store, origin);
  }
}

async function flushDigest(user: User, store: Store, pending: Notification[], origin: string): Promise<void> {
  const { send, skip } = digestBatch(pending);
  if (skip.length > 0) await markEmail(skip, "skipped");
  if (send.length === 0) return;
  if (!(await claimDigest(user.id, store.id, new Date().toISOString()))) return;
  // Read again after the claim, so an order that landed meanwhile rides along.
  const fresh = digestBatch(
    await db.find<Notification>(COLLECTIONS.notifications, {
      userId: user.id,
      storeId: store.id,
      email: "pending",
    }),
  );
  if (fresh.skip.length > 0) await markEmail(fresh.skip, "skipped");
  if (fresh.send.length === 0) return;
  await markEmail(fresh.send, "sent");
  await emailDigest(user, store, fresh.send, origin);
}

/**
 * Takes the hourly slot for one person and store. Only one caller wins it, so
 * two orders arriving together still produce a single email.
 */
async function claimDigest(userId: string, storeId: string, now: string): Promise<boolean> {
  const id = `${userId}:${storeId}`;
  const cutoff = new Date(new Date(now).getTime() - DIGEST_WINDOW_MS).toISOString();
  const updated = await db.updateOne(
    COLLECTIONS.notificationDigests,
    { id, lastSentAt: { $lte: cutoff } },
    { $set: { lastSentAt: now } },
  );
  if (updated.modifiedCount === 1) return true;
  const existing = await db.findOne<{ lastSentAt: string }>(COLLECTIONS.notificationDigests, { id });
  if (existing) return false;
  try {
    await db.insertOne(COLLECTIONS.notificationDigests, { id, userId, storeId, lastSentAt: now });
    return true;
  } catch {
    // Someone else created the slot a moment ago, and with it took this hour.
    return false;
  }
}

async function markEmail(rows: Notification[], status: "sent" | "skipped"): Promise<void> {
  await db.updateMany(
    COLLECTIONS.notifications,
    { id: { $in: rows.map((n) => n.id) }, email: "pending" },
    { $set: { email: status } },
  );
}

/* --------------------------------------------------------------- emails */

function languageFor(user: User, store: Store): Locale {
  if (isLocale(user.uiLanguage)) return user.uiLanguage;
  return isLocale(store.defaultLanguage) ? store.defaultLanguage : DEFAULT_LOCALE;
}

/** The store's branding, without the shopper support line a team member does not need. */
function teamBrand(store: Store) {
  return { ...brandFor(store), supportEmail: null };
}

async function notificationCopy(locale: Locale) {
  const [t, format, frame] = await Promise.all([
    getTranslations({ locale, namespace: "notifications" }),
    getFormatter({ locale }),
    emailCopy(locale),
  ]);
  return { t, format, frame };
}

function messageValues(params: NotificationParams, format: Awaited<ReturnType<typeof getFormatter>>) {
  return {
    code: params.code ?? "",
    name: params.name ?? "",
    count: params.count ?? 0,
    amount:
      typeof params.amount === "number" && params.currency
        ? formatMinorUnits(format, params.amount, params.currency)
        : "",
  };
}

async function emailOne(user: User, store: Store, notification: Notification, origin: string): Promise<void> {
  const { t, format, frame } = await notificationCopy(languageFor(user, store));
  const title = t(`titles.${notificationTitleKey(notification.type, notification.params)}`, messageValues(notification.params, format));
  sendEmail({
    to: user.email,
    message: notificationEmail(teamBrand(store), frame, {
      subject: t("email.subject", { title, store: store.name }),
      heading: title,
      name: user.name,
      paragraphs: [],
      rows: [{ label: t("email.storeLabel"), value: store.name }],
      action: { label: t("email.cta"), url: `${origin}${notification.href}` },
    }),
    kind: "team notification",
    storeId: store.id,
    agencyId: store.agencyId,
  });
}

async function emailDigest(user: User, store: Store, rows: Notification[], origin: string): Promise<void> {
  const { t, format, frame } = await notificationCopy(languageFor(user, store));
  const count = rows.length;
  sendEmail({
    to: user.email,
    message: notificationEmail(teamBrand(store), frame, {
      subject: t("email.digestSubject", { count, store: store.name }),
      heading: t("email.digestHeading", { count }),
      name: user.name,
      paragraphs: [],
      rows: rows.map((n) => ({ label: n.params.code ?? "", value: messageValues(n.params, format).amount })),
      action: { label: t("email.digestCta"), url: `${origin}/app/stores/${store.id}/orders` },
    }),
    kind: "new order digest",
    storeId: store.id,
    agencyId: store.agencyId,
  });
}
