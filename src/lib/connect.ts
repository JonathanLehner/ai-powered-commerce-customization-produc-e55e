import "server-only";
import { recordAudit, updateStore } from "./data";
import type { ConnectStatus } from "./stripe";
import type { Store } from "./types";

/**
 * Writes what Stripe reports about a store's Connect account onto the store,
 * and logs the change. Called from the onboarding return page and from the
 * `account.updated` webhook; a report that changes nothing writes nothing.
 */
export async function applyConnectStatus(
  store: Store,
  status: ConnectStatus,
  actor: { id: string; name: string },
): Promise<Store> {
  const current = store.stripe;
  const changed =
    current.accountId !== status.accountId ||
    current.chargesEnabled !== status.chargesEnabled ||
    Boolean(current.payoutsEnabled) !== status.payoutsEnabled ||
    Boolean(current.detailsSubmitted) !== status.detailsSubmitted ||
    current.country !== status.country;
  if (!changed) return store;

  const stripe: Store["stripe"] = {
    ...current,
    connected: true,
    express: true,
    accountId: status.accountId,
    country: status.country,
    chargesEnabled: status.chargesEnabled,
    payoutsEnabled: status.payoutsEnabled,
    detailsSubmitted: status.detailsSubmitted,
    connectedAt: current.connectedAt ?? new Date().toISOString(),
  };
  const setup = { ...store.setup, payments: status.chargesEnabled };
  await updateStore(store.id, { stripe, setup });
  recordAudit({
    category: "store_setup",
    action: "store.stripe_status",
    summary: `Stripe account ${status.accountId}: charges ${status.chargesEnabled ? "enabled" : "not enabled"}, payouts ${status.payoutsEnabled ? "enabled" : "not enabled"}`,
    storeId: store.id,
    agencyId: store.agencyId,
    actorId: actor.id,
    actorName: actor.name,
    entity: "store",
    entityId: store.id,
    meta: {
      accountId: status.accountId,
      chargesEnabled: status.chargesEnabled,
      payoutsEnabled: status.payoutsEnabled,
      detailsSubmitted: status.detailsSubmitted,
    },
  });
  return { ...store, stripe, setup };
}
