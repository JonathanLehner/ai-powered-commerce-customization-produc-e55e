/**
 * Custom domains: which host names a store may connect, the DNS record each
 * one needs, and how Cloudflare's view of a domain reads to a merchant.
 *
 * A domain is connected as a Cloudflare for SaaS custom hostname on the
 * platform's zone, plus a Worker route that sends its traffic to this app. The
 * zone is shared with other sites, so the app only ever changes the hostnames
 * and routes whose ids it recorded itself (see `@/lib/operations/domains`).
 *
 * Kept free of server imports: the domains page, the proxy and
 * `npm run domains-check` all read it.
 */

/** Where a merchant points their DNS when the deployment does not name a target. */
export const DEFAULT_CNAME_TARGET = "customers.clawcorp.ai";

/** The platform's own domain. No store may connect it or anything under it. */
export const RESERVED_DOMAIN = "clawcorp.ai";

/** The most domains one store may connect. */
export const MAX_DOMAINS_PER_STORE = 10;

/**
 * - `pending_setup`: saved, but domain connection is not configured on this
 *   deployment yet; nothing has been created on Cloudflare.
 * - `pending`: created on Cloudflare, waiting for DNS and the certificate.
 * - `active`: the hostname resolves to the store over HTTPS.
 * - `failed`: Cloudflare gave up on it (blocked, moved, or validation timed out).
 */
export type DomainStatus = "pending_setup" | "pending" | "active" | "failed";

export const DOMAIN_STATUSES: readonly DomainStatus[] = ["pending_setup", "pending", "active", "failed"];

export interface StoreDomain {
  id: string;
  storeId: string;
  /** Lowercased, punycode for international names. Unique across the platform. */
  hostname: string;
  /** The address the storefront is canonical at. One per store. */
  primary: boolean;
  status: DomainStatus;
  /** Cloudflare's own status of the custom hostname, e.g. `pending` or `active`. */
  hostnameStatus: string | null;
  /** Cloudflare's certificate status, e.g. `pending_validation` or `active`. */
  sslStatus: string | null;
  verificationErrors: string[];
  /** A TXT record Cloudflare asks for before it serves the hostname, when it asks for one. */
  ownership: { name: string; value: string } | null;
  /**
   * What this app created on the shared zone. Only these ids are ever changed
   * or deleted; anything else on the zone belongs to someone else.
   */
  cloudflare: {
    customHostnameId: string | null;
    workerRouteId: string | null;
    routePattern: string | null;
  };
  createdById: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  /** When Cloudflare was last asked about it. */
  checkedAt: string | null;
}

/**
 * The host name in what a merchant typed, or null when it is not one:
 * `https://Shop.Example.com/products` → `shop.example.com`. International
 * names come back in punycode, which is what DNS and Cloudflare use.
 */
export function normalizeHostname(input: string): string | null {
  let raw = input.trim().toLowerCase();
  if (!raw) return null;
  raw = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/[/?#].*$/, "").replace(/\.$/, "");
  if (raw.includes("@") || raw.includes(" ")) return null;
  let host: string;
  try {
    host = new URL(`http://${raw}`).hostname;
  } catch {
    return null;
  }
  if (host.length > 253) return null;
  const labels = host.split(".");
  if (labels.length < 2) return null;
  if (!labels.every((label) => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null;
  // A top-level domain is letters (or an xn-- name), never a number: this
  // also turns away IP addresses.
  if (!/^([a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(labels[labels.length - 1])) return null;
  return host;
}

/** The platform's own domain or anything under it. */
export function isReservedHostname(hostname: string): boolean {
  return hostname === RESERVED_DOMAIN || hostname.endsWith(`.${RESERVED_DOMAIN}`);
}

/** Public suffixes of two labels that domains are commonly registered under. */
const TWO_LABEL_SUFFIXES = new Set([
  "co.uk", "org.uk", "me.uk", "ltd.uk", "plc.uk", "ac.uk",
  "com.au", "net.au", "org.au",
  "co.nz", "org.nz", "net.nz",
  "co.jp", "ne.jp", "or.jp",
  "com.br", "net.br",
  "com.mx", "org.mx",
  "co.za", "org.za",
  "com.sg", "com.hk", "com.tr", "com.cn", "com.tw", "com.ar", "com.co",
  "co.in", "co.kr", "co.il", "co.id", "co.th",
]);

/** The name the owner registered: `example.co.uk` for `shop.example.co.uk`. */
export function registrableDomain(hostname: string): string {
  const labels = hostname.split(".");
  const lastTwo = labels.slice(-2).join(".");
  const take = TWO_LABEL_SUFFIXES.has(lastTwo) && labels.length >= 3 ? 3 : 2;
  return labels.slice(-take).join(".");
}

/** A root domain such as `example.com`, which DNS cannot give a CNAME record. */
export function isApexDomain(hostname: string): boolean {
  return registrableDomain(hostname) === hostname;
}

/**
 * The other half of the www / root pair: `www.example.com` for
 * `example.com` and the other way round. Null for any other subdomain.
 */
export function companionHostname(hostname: string): string | null {
  if (isApexDomain(hostname)) return `www.${hostname}`;
  if (hostname.startsWith("www.") && isApexDomain(hostname.slice(4))) return hostname.slice(4);
  return null;
}

export interface DnsRecord {
  /** `CNAME` for a subdomain; `ALIAS` (ANAME, or CNAME flattening) for a root domain. */
  type: "CNAME" | "ALIAS";
  /** The name as most DNS providers ask for it: `@` for the root, `www` or `shop` otherwise. */
  name: string;
  value: string;
  apex: boolean;
}

/** The record a merchant adds at their DNS provider for `hostname`. */
export function dnsRecordFor(hostname: string, target: string): DnsRecord {
  const apex = isApexDomain(hostname);
  const root = registrableDomain(hostname);
  return {
    type: apex ? "ALIAS" : "CNAME",
    name: apex ? "@" : hostname.slice(0, -(root.length + 1)),
    value: target,
    apex,
  };
}

/** The Worker route pattern that sends a hostname's traffic to the app. */
export function routePatternFor(hostname: string): string {
  return `${hostname}/*`;
}

/**
 * Whether a Worker route pattern (`shop.example.com/*`, `*.example.com/*`)
 * already catches traffic for `hostname`.
 */
export function routeCovers(pattern: string, hostname: string): boolean {
  const host = pattern.toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
  if (!host) return false;
  if (host === hostname) return true;
  // `*.example.com` catches every subdomain; `*example.com` the root as well.
  return host.startsWith("*") && hostname.endsWith(host.slice(1));
}

/** The part of a Cloudflare custom hostname this app reads. */
export interface CloudflareHostnameState {
  status?: string | null;
  ssl?: { status?: string | null } | null;
  verification_errors?: string[] | null;
  ownership_verification?: { name?: string | null; value?: string | null } | null;
}

const FAILED_HOSTNAME = new Set(["blocked", "moved", "deleted", "pending_deletion", "test_failed", "test_blocked"]);

/** How a Cloudflare custom hostname reads to a merchant. */
export function domainStatusFrom(state: CloudflareHostnameState): DomainStatus {
  const hostname = state.status ?? "";
  const ssl = state.ssl?.status ?? "";
  if (hostname === "active" && ssl === "active") return "active";
  if (FAILED_HOSTNAME.has(hostname) || ssl.endsWith("_timed_out") || ssl === "expired" || ssl === "deleted") return "failed";
  return "pending";
}

/** The fields of a domain record that follow from Cloudflare's view of it. */
export function domainFieldsFrom(
  state: CloudflareHostnameState,
): Pick<StoreDomain, "status" | "hostnameStatus" | "sslStatus" | "verificationErrors" | "ownership"> {
  const ownership = state.ownership_verification;
  return {
    status: domainStatusFrom(state),
    hostnameStatus: state.status ?? null,
    sslStatus: state.ssl?.status ?? null,
    verificationErrors: (state.verification_errors ?? []).filter(Boolean).slice(0, 5),
    ownership: ownership?.name && ownership.value ? { name: ownership.name, value: ownership.value } : null,
  };
}

/** The domain shoppers are sent to: the primary one, once it serves. */
export function primaryDomain(domains: Pick<StoreDomain, "hostname" | "primary" | "status">[]) {
  return domains.find((domain) => domain.primary) ?? null;
}

/** The domain to make primary when the primary one is removed: an active one first, then the oldest. */
export function nextPrimary<T extends Pick<StoreDomain, "status" | "createdAt">>(domains: T[]): T | null {
  const sorted = [...domains].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return sorted.find((domain) => domain.status === "active") ?? sorted[0] ?? null;
}
