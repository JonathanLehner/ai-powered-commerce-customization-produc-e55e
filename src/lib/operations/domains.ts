import "server-only";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import {
  createCustomHostname,
  createWorkerRoute,
  deleteOwnedHostname,
  deleteOwnedRoute,
  getCustomHostname,
  saasConfig,
  zoneHasHostname,
  zoneRoutesHostname,
  type SaasConfig,
} from "../cloudflare-saas";
import { COLLECTIONS, getStore, recordAudit, updateStore } from "../data";
import {
  MAX_DOMAINS_PER_STORE,
  companionHostname,
  domainFieldsFrom,
  isReservedHostname,
  nextPrimary,
  normalizeHostname,
  type StoreDomain,
} from "../domains";
import { db } from "../mongo";
import type { Store } from "../types";
import { newId } from "../util";
import { OperationError, type OperationContext } from "./context";

/**
 * A store's custom domains, connected through Cloudflare for SaaS: a custom
 * hostname on the platform's zone (certificate by HTTP validation) and a Worker
 * route `{hostname}/*` to this app.
 *
 * The zone is shared, so:
 * - a host name already on the zone, as a custom hostname or under a Worker
 *   route, is refused, as is anything under clawcorp.ai;
 * - the ids of what was created are written to `store_domains` the moment
 *   Cloudflare returns them, and removal only ever deletes those ids;
 * - a domain is claimed in the database (unique by host name) before anything
 *   is created, so a double click or two stores asking at once create nothing
 *   twice.
 *
 * Only store administrators reach these: the workspace actions require the
 * settings capability and the API's `domains` scope requires the key's maker
 * to still administer the store.
 */

async function messages(ctx: OperationContext) {
  return getTranslations({ locale: ctx.locale, namespace: "actions.domains" });
}

function audit(ctx: OperationContext, action: string, summary: string, hostname: string) {
  recordAudit({
    category: "store_setup",
    action,
    summary,
    storeId: ctx.store.id,
    agencyId: ctx.store.agencyId,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    entity: "store",
    entityId: ctx.store.id,
    meta: { domain: hostname },
  });
}

export function listDomains(storeId: string): Promise<StoreDomain[]> {
  return db.find<StoreDomain>(COLLECTIONS.storeDomains, { storeId }, { sort: { createdAt: 1 } });
}

export function findDomain(storeId: string, domainId: string): Promise<StoreDomain | null> {
  return db.findOne<StoreDomain>(COLLECTIONS.storeDomains, { storeId, id: domainId });
}

async function saveDomainFields(domain: StoreDomain, patch: Partial<StoreDomain>): Promise<StoreDomain> {
  const next = { ...patch, updatedAt: new Date().toISOString() };
  await db.updateOne(COLLECTIONS.storeDomains, { id: domain.id }, { $set: next });
  return { ...domain, ...next };
}

/**
 * Mirrors the domains onto the store record: every host name (so the proxy
 * finds the store by host in one read), the primary one, and whether it
 * serves yet. Canonical links, emails and the sitemap read these.
 */
export async function syncStoreDomains(store: Store): Promise<Store> {
  const domains = await listDomains(store.id);
  const primary = domains.find((domain) => domain.primary) ?? null;
  const verified = primary?.status === "active";
  const patch: Partial<Store> = {
    domainHosts: domains.map((domain) => domain.hostname),
    customDomain: primary?.hostname ?? null,
    domainStatus: primary ? (verified ? "verified" : "pending") : "unset",
    setup: { ...store.setup, domain: verified },
  };
  await updateStore(store.id, patch);
  revalidatePath(`/app/stores/${store.id}/domains`);
  revalidatePath(`/app/stores/${store.id}/setup`);
  revalidatePath(`/s/${store.slug}`, "layout");
  return { ...store, ...patch };
}

/** Refuses a host name the zone already serves, whoever put it there. */
async function assertFreeOnZone(config: SaasConfig, hostname: string, t: Awaited<ReturnType<typeof messages>>) {
  const [hasHostname, hasRoute] = await Promise.all([
    zoneHasHostname(config, hostname),
    zoneRoutesHostname(config, hostname),
  ]);
  if (hasHostname || hasRoute) throw new OperationError("conflict", t("inUse", { domain: hostname }), "hostname");
}

/**
 * Creates the custom hostname and the Worker route for a claimed domain,
 * recording each id as soon as Cloudflare returns it. When the route cannot be
 * made, the hostname just created is taken down again so nothing is left
 * half-connected on the zone.
 */
async function provision(config: SaasConfig, domain: StoreDomain): Promise<StoreDomain> {
  let current = domain;
  if (!current.cloudflare.customHostnameId) {
    const created = await createCustomHostname(config, current.hostname);
    current = await saveDomainFields(current, {
      cloudflare: { ...current.cloudflare, customHostnameId: created.id },
      ...domainFieldsFrom(created),
      checkedAt: new Date().toISOString(),
    });
  }
  if (!current.cloudflare.workerRouteId) {
    try {
      const route = await createWorkerRoute(config, current.hostname);
      current = await saveDomainFields(current, {
        cloudflare: { ...current.cloudflare, workerRouteId: route.id, routePattern: route.pattern },
      });
    } catch (error) {
      const hostnameId = current.cloudflare.customHostnameId;
      if (hostnameId && (await deleteOwnedHostname(config, hostnameId, current.hostname).catch(() => false))) {
        current = await saveDomainFields(current, {
          cloudflare: { ...current.cloudflare, customHostnameId: null },
          status: "pending",
          hostnameStatus: null,
          sslStatus: null,
        });
      }
      throw error;
    }
  }
  return current;
}

export interface ConnectDomainInput {
  hostname: string;
  /** Also connect the other half of a www / root pair. */
  includeCompanion?: boolean;
  /** Make the entered domain the primary one. The first domain a store connects always is. */
  primary?: boolean;
}

/**
 * Connects a domain, and with `includeCompanion` its www or root partner.
 * Both are checked before anything is created. Without Cloudflare settings
 * on the deployment the domains are saved as setup pending, and connect when
 * they are next checked once the settings are there.
 */
export async function connectDomain(ctx: OperationContext, input: ConnectDomainInput): Promise<StoreDomain[]> {
  const t = await messages(ctx);
  const hostname = normalizeHostname(input.hostname);
  if (!hostname) throw new OperationError("invalid", t("invalid"), "hostname");
  const companion = input.includeCompanion ? companionHostname(hostname) : null;
  const wanted = companion ? [hostname, companion] : [hostname];

  for (const name of wanted) {
    if (isReservedHostname(name)) throw new OperationError("invalid", t("reserved", { domain: name }), "hostname");
  }
  const existing = await listDomains(ctx.store.id);
  if (existing.length + wanted.length > MAX_DOMAINS_PER_STORE) {
    throw new OperationError("conflict", t("limit", { max: MAX_DOMAINS_PER_STORE }), "hostname");
  }
  const taken = await db.find<StoreDomain>(COLLECTIONS.storeDomains, { hostname: { $in: wanted } });
  if (taken.length > 0) {
    const mine = taken.find((domain) => domain.storeId === ctx.store.id);
    throw new OperationError(
      "conflict",
      mine ? t("alreadyConnected", { domain: mine.hostname }) : t("taken", { domain: taken[0].hostname }),
      "hostname",
    );
  }

  const config = saasConfig();
  if (config) {
    try {
      for (const name of wanted) await assertFreeOnZone(config, name, t);
    } catch (error) {
      if (error instanceof OperationError) throw error;
      console.error("Cloudflare could not be checked for", hostname, error);
      throw new OperationError("conflict", t("connectFailed", { domain: hostname }), "hostname");
    }
  }

  // The claim: inserted before Cloudflare is called, and unique by host name.
  const now = new Date().toISOString();
  const makePrimary = !existing.some((domain) => domain.primary) || input.primary === true;
  const claimed: StoreDomain[] = [];
  for (const name of wanted) {
    const domain: StoreDomain = {
      id: newId("dom"),
      storeId: ctx.store.id,
      hostname: name,
      primary: false,
      status: config ? "pending" : "pending_setup",
      hostnameStatus: null,
      sslStatus: null,
      verificationErrors: [],
      ownership: null,
      cloudflare: { customHostnameId: null, workerRouteId: null, routePattern: null },
      createdById: ctx.actor.id,
      createdByName: ctx.actor.name,
      createdAt: now,
      updatedAt: now,
      checkedAt: null,
    };
    try {
      await db.insertOne(COLLECTIONS.storeDomains, domain as unknown as Record<string, unknown>);
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      if (claimed.length === 0) throw new OperationError("conflict", t("taken", { domain: name }), "hostname");
      break;
    }
    claimed.push(domain);
  }

  if (makePrimary) {
    await db.updateMany(COLLECTIONS.storeDomains, { storeId: ctx.store.id }, { $set: { primary: false } });
    await db.updateOne(COLLECTIONS.storeDomains, { id: claimed[0].id }, { $set: { primary: true } });
    claimed[0] = { ...claimed[0], primary: true };
  }

  const connected: StoreDomain[] = [];
  let failure: string | null = null;
  for (const domain of claimed) {
    if (!config) {
      connected.push(domain);
      continue;
    }
    try {
      connected.push(await provision(config, domain));
      audit(ctx, "store.domain_connected", `Connected the domain ${domain.hostname}`, domain.hostname);
    } catch (error) {
      console.error("Domain could not be connected", domain.hostname, error);
      // Nothing of it is left on Cloudflare (`provision` cleans up), so the
      // claim goes too and the merchant can simply try again.
      const fresh = await db.findOne<StoreDomain>(COLLECTIONS.storeDomains, { id: domain.id });
      if (fresh && !fresh.cloudflare.customHostnameId && !fresh.cloudflare.workerRouteId) {
        await db.deleteOne(COLLECTIONS.storeDomains, { id: domain.id });
      } else if (fresh) {
        connected.push(fresh);
      }
      failure ??= domain.hostname;
    }
  }
  if (!config) {
    audit(ctx, "store.domain_saved", `Saved the domain ${hostname}; connection is pending setup`, hostname);
  }

  const store = (await getStore(ctx.store.id)) ?? ctx.store;
  const remaining = await listDomains(ctx.store.id);
  if (!remaining.some((domain) => domain.primary) && remaining.length > 0) {
    const promote = nextPrimary(remaining);
    if (promote) await db.updateOne(COLLECTIONS.storeDomains, { id: promote.id }, { $set: { primary: true } });
  }
  await syncStoreDomains(store);
  if (failure) throw new OperationError("conflict", t("connectFailed", { domain: failure }), "hostname");
  return connected;
}

/**
 * Asks Cloudflare where a domain is up to and records it. A domain saved
 * while setup was pending is connected now, once the settings are there; a
 * domain whose route is missing gets it.
 */
export async function refreshDomain(ctx: OperationContext, domain: StoreDomain): Promise<StoreDomain> {
  const t = await messages(ctx);
  const config = saasConfig();
  if (!config) return domain;
  let current = domain;
  try {
    if (!current.cloudflare.customHostnameId) {
      await assertFreeOnZone(config, current.hostname, t);
      current = await provision(config, { ...current, status: "pending" });
      audit(ctx, "store.domain_connected", `Connected the domain ${current.hostname}`, current.hostname);
    } else {
      const state = await getCustomHostname(config, current.cloudflare.customHostnameId);
      if (!state || state.hostname.toLowerCase() !== current.hostname) {
        // Gone from the zone, or the id now names something else: it is no
        // longer ours to read, so the record forgets it and shows as failed.
        current = await saveDomainFields(current, {
          cloudflare: { ...current.cloudflare, customHostnameId: null },
          status: "failed",
          hostnameStatus: null,
          sslStatus: null,
          checkedAt: new Date().toISOString(),
        });
      } else {
        current = await saveDomainFields(current, { ...domainFieldsFrom(state), checkedAt: new Date().toISOString() });
        if (!current.cloudflare.workerRouteId) current = await provision(config, current);
      }
    }
  } catch (error) {
    if (error instanceof OperationError) throw error;
    console.error("Domain could not be checked", current.hostname, error);
    throw new OperationError("conflict", t("checkFailed", { domain: current.hostname }), "hostname");
  }
  if (current.status !== domain.status || current.primary) {
    await syncStoreDomains((await getStore(ctx.store.id)) ?? ctx.store);
  }
  return current;
}

/** Checks every domain of the store that is not serving yet. */
export async function refreshDomains(ctx: OperationContext): Promise<StoreDomain[]> {
  const domains = await listDomains(ctx.store.id);
  const out: StoreDomain[] = [];
  for (const domain of domains) {
    out.push(domain.status === "active" ? domain : await refreshDomain(ctx, domain).catch(() => domain));
  }
  return out;
}

/** Makes a domain the one shoppers are sent to and pages are canonical at. */
export async function setPrimaryDomain(ctx: OperationContext, domain: StoreDomain): Promise<StoreDomain> {
  if (domain.primary) return domain;
  await db.updateMany(COLLECTIONS.storeDomains, { storeId: ctx.store.id }, { $set: { primary: false } });
  const saved = await saveDomainFields(domain, { primary: true });
  audit(ctx, "store.domain_primary", `Made ${domain.hostname} the primary domain`, domain.hostname);
  await syncStoreDomains((await getStore(ctx.store.id)) ?? ctx.store);
  return saved;
}

/**
 * Disconnects a domain: the Worker route and the custom hostname this app
 * created are deleted (each read back first, see `@/lib/cloudflare-saas`),
 * then the record. If Cloudflare cannot be reached the record is kept, so
 * nothing on the zone is left without a record of who made it.
 */
export async function removeDomain(ctx: OperationContext, domain: StoreDomain): Promise<void> {
  const t = await messages(ctx);
  const { customHostnameId, workerRouteId, routePattern } = domain.cloudflare;
  if (customHostnameId || workerRouteId) {
    const config = saasConfig();
    if (!config) throw new OperationError("conflict", t("removeUnavailable", { domain: domain.hostname }));
    try {
      if (workerRouteId) {
        await deleteOwnedRoute(config, workerRouteId, routePattern ?? `${domain.hostname}/*`);
        await saveDomainFields(domain, { cloudflare: { ...domain.cloudflare, workerRouteId: null } });
      }
      if (customHostnameId) await deleteOwnedHostname(config, customHostnameId, domain.hostname);
    } catch (error) {
      console.error("Domain could not be removed", domain.hostname, error);
      throw new OperationError("conflict", t("removeFailed", { domain: domain.hostname }));
    }
  }
  await db.deleteOne(COLLECTIONS.storeDomains, { id: domain.id });
  if (domain.primary) {
    const promote = nextPrimary(await listDomains(ctx.store.id));
    if (promote) await db.updateOne(COLLECTIONS.storeDomains, { id: promote.id }, { $set: { primary: true } });
  }
  audit(ctx, "store.domain_removed", `Removed the domain ${domain.hostname}`, domain.hostname);
  await syncStoreDomains((await getStore(ctx.store.id)) ?? ctx.store);
}
