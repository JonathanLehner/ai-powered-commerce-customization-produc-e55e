import "server-only";
import Cloudflare, { NotFoundError } from "cloudflare";
import { DEFAULT_CNAME_TARGET, routeCovers, routePatternFor, type CloudflareHostnameState } from "./domains";

/**
 * Cloudflare for SaaS, through Cloudflare's SDK: custom hostnames and Worker
 * routes on the platform's zone. This is how the platform connects a domain to
 * a project, and how a store's domain is connected here.
 *
 * The zone is shared with other sites. Nothing in this module lists and then
 * deletes: every change names an id the caller recorded when this app created
 * it, and `deleteOwnedHostname` / `deleteOwnedRoute` read the object back
 * first and leave it alone unless it is still exactly what was created.
 */

export interface SaasConfig {
  apiToken: string;
  zoneId: string;
  cnameTarget: string;
  workerName: string;
}

/**
 * The deployment's settings, read per call (the environment is only filled in
 * once a request is in flight). Null until all four are set, which the
 * domains page shows as setup pending.
 */
export function saasConfig(): SaasConfig | null {
  const apiToken = process.env.CLOUDFLARE_SAAS_API_TOKEN?.trim();
  const zoneId = process.env.CLOUDFLARE_ZONE_ID?.trim();
  const cnameTarget = process.env.CLOUDFLARE_SAAS_CNAME_TARGET?.trim();
  const workerName = process.env.CLOUDFLARE_WORKER_NAME?.trim();
  if (!apiToken || !zoneId || !cnameTarget || !workerName) return null;
  return { apiToken, zoneId, cnameTarget, workerName };
}

/** Where merchants point their DNS. Shown even before the rest is configured. */
export function cnameTarget(): string {
  return process.env.CLOUDFLARE_SAAS_CNAME_TARGET?.trim() || DEFAULT_CNAME_TARGET;
}

/**
 * `npm run domains-check` puts a mock here so the SDK's requests never leave
 * the process. Nothing in the app sets it.
 */
const FETCH_OVERRIDE = Symbol.for("parcelith.cloudflare-fetch");

function client(config: SaasConfig): Cloudflare {
  const fetch = (globalThis as Record<symbol, typeof globalThis.fetch | undefined>)[FETCH_OVERRIDE];
  return new Cloudflare({ apiToken: config.apiToken, maxRetries: 1, timeout: 20_000, ...(fetch ? { fetch } : {}) });
}

export interface CustomHostnameRecord extends CloudflareHostnameState {
  id: string;
  hostname: string;
}

/** Whether the zone already has this hostname, whoever added it. */
export async function zoneHasHostname(config: SaasConfig, hostname: string): Promise<boolean> {
  // Compared again here, page by page: a looser match on Cloudflare's side
  // must neither read as a clash nor hide one on a later page.
  let seen = 0;
  for await (const entry of client(config).customHostnames.list({ zone_id: config.zoneId, hostname: { exact: hostname } })) {
    if (entry.hostname.toLowerCase() === hostname) return true;
    if (++seen >= 5_000) break;
  }
  return false;
}

/** Whether a Worker route on the zone already catches this hostname's traffic. */
export async function zoneRoutesHostname(config: SaasConfig, hostname: string): Promise<boolean> {
  const page = await client(config).workers.routes.list({ zone_id: config.zoneId });
  return page.result.some((route) => routeCovers(route.pattern, hostname));
}

export async function createCustomHostname(config: SaasConfig, hostname: string): Promise<CustomHostnameRecord> {
  const created = await client(config).customHostnames.create({
    zone_id: config.zoneId,
    hostname,
    ssl: { method: "http", type: "dv" },
  });
  return created as CustomHostnameRecord;
}

/** A custom hostname this app created, or null once it is gone. */
export async function getCustomHostname(config: SaasConfig, id: string): Promise<CustomHostnameRecord | null> {
  try {
    return (await client(config).customHostnames.get(id, { zone_id: config.zoneId })) as CustomHostnameRecord;
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}

export async function createWorkerRoute(config: SaasConfig, hostname: string): Promise<{ id: string; pattern: string }> {
  const pattern = routePatternFor(hostname);
  const created = await client(config).workers.routes.create({
    zone_id: config.zoneId,
    pattern,
    script: config.workerName,
  });
  return { id: created.id, pattern };
}

/**
 * Deletes a custom hostname this app created. It is read back first and only
 * deleted while it still carries the recorded hostname. Returns false when it
 * was left alone because it is something else now; true when it is gone.
 */
export async function deleteOwnedHostname(config: SaasConfig, id: string, hostname: string): Promise<boolean> {
  const current = await getCustomHostname(config, id);
  if (!current) return true;
  if (current.hostname.toLowerCase() !== hostname) return false;
  try {
    await client(config).customHostnames.delete(id, { zone_id: config.zoneId });
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error;
  }
  return true;
}

/**
 * Deletes a Worker route this app created, after reading it back: it has to
 * still have the recorded pattern and point at this app's Worker.
 */
export async function deleteOwnedRoute(config: SaasConfig, id: string, pattern: string): Promise<boolean> {
  const api = client(config).workers.routes;
  let current: { pattern: string; script?: string };
  try {
    current = await api.get(id, { zone_id: config.zoneId });
  } catch (error) {
    if (error instanceof NotFoundError) return true;
    throw error;
  }
  if (current.pattern !== pattern || current.script !== config.workerName) return false;
  try {
    await api.delete(id, { zone_id: config.zoneId });
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error;
  }
  return true;
}
