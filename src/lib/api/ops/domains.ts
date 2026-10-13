import "server-only";
import { z } from "zod";
import { cnameTarget, saasConfig } from "../../cloudflare-saas";
import { dnsRecordFor, type StoreDomain } from "../../domains";
import {
  connectDomain,
  findDomain,
  listDomains,
  refreshDomain,
  removeDomain,
  setPrimaryDomain,
} from "../../operations/domains";
import type { OperationContext } from "../../operations/context";
import { define, id, notFound, type ApiOperation } from "../define";

/**
 * Custom domains: connect a domain (and its www or root partner), check its
 * DNS and certificate, pick the primary one, disconnect. Only keys made by a
 * store administrator, while they still are one, may use these.
 */

export function presentDomain(domain: StoreDomain, target = cnameTarget()) {
  return {
    id: domain.id,
    hostname: domain.hostname,
    primary: domain.primary,
    status: domain.status,
    hostnameStatus: domain.hostnameStatus,
    sslStatus: domain.sslStatus,
    verificationErrors: domain.verificationErrors,
    dnsRecords: [
      dnsRecordFor(domain.hostname, target),
      ...(domain.ownership ? [{ type: "TXT", name: domain.ownership.name, value: domain.ownership.value, apex: false }] : []),
    ],
    checkedAt: domain.checkedAt,
    createdAt: domain.createdAt,
  };
}

async function domain(ctx: OperationContext, domainId: string): Promise<StoreDomain> {
  return (await findDomain(ctx.store.id, domainId)) ?? notFound("Domain");
}

const STATUS_NOTE =
  "status is pending_setup (saved; domain connection is not configured on this deployment yet), pending (waiting for DNS and the certificate), active (serving over HTTPS) or failed.";

export const domainOperations: ApiOperation[] = [
  define({
    id: "listDomains",
    method: "GET",
    path: "/domains",
    scope: "domains:read",
    tag: "Domains",
    summary: "List the custom domains",
    description: `The store's custom domains with the DNS record each needs, the primary one first in importance. ${STATUS_NOTE} setupPending is true while domain connection is not configured on this deployment.`,
    input: z.object({}),
    run: async (ctx) => {
      const target = cnameTarget();
      return {
        data: (await listDomains(ctx.store.id)).map((row) => presentDomain(row, target)),
        cnameTarget: target,
        setupPending: saasConfig() === null,
      };
    },
  }),
  define({
    id: "connectDomain",
    method: "POST",
    path: "/domains",
    scope: "domains:write",
    tag: "Domains",
    status: 201,
    summary: "Connect a custom domain",
    description:
      "Connects a domain such as shop.example.com or example.com to the storefront. With includeCompanion, the www or root partner (example.com and www.example.com) is connected too. Refused with 409 when the domain is connected anywhere already, and with 422 for addresses under clawcorp.ai. The store's first domain becomes primary. Point the returned DNS records at the target, then check with refreshDomain.",
    input: z.object({
      hostname: z.string().min(1).max(253).describe("The domain, such as shop.example.com."),
      includeCompanion: z.boolean().optional().describe("Also connect the www or root partner of the domain."),
      primary: z.boolean().optional().describe("Make this domain primary. The first domain always is."),
    }),
    actions: ["domains#connectDomain"],
    run: async (ctx, input) => {
      const target = cnameTarget();
      const connected = await connectDomain(ctx, input);
      return { data: connected.map((row) => presentDomain(row, target)) };
    },
  }),
  define({
    id: "getDomain",
    method: "GET",
    path: "/domains/{domainId}",
    scope: "domains:read",
    tag: "Domains",
    summary: "Get a custom domain",
    description: `One domain as last checked. ${STATUS_NOTE}`,
    input: z.object({ domainId: id("domain") }),
    run: async (ctx, input) => presentDomain(await domain(ctx, input.domainId)),
  }),
  define({
    id: "refreshDomain",
    method: "POST",
    path: "/domains/{domainId}/refresh",
    scope: "domains:write",
    tag: "Domains",
    summary: "Check a domain's DNS and certificate",
    description:
      "Asks Cloudflare for the domain's verification and certificate status and records it. A domain saved while setup was pending is connected now if the deployment is configured.",
    input: z.object({ domainId: id("domain") }),
    actions: ["domains#refreshDomains"],
    run: async (ctx, input) => presentDomain(await refreshDomain(ctx, await domain(ctx, input.domainId))),
  }),
  define({
    id: "setPrimaryDomain",
    method: "POST",
    path: "/domains/{domainId}/primary",
    scope: "domains:write",
    tag: "Domains",
    summary: "Make a domain primary",
    description:
      "Shoppers on the store's other addresses are redirected to the primary domain once it is active, and canonical links, the sitemap and emails use it.",
    input: z.object({ domainId: id("domain") }),
    actions: ["domains#setPrimaryDomain"],
    run: async (ctx, input) => presentDomain(await setPrimaryDomain(ctx, await domain(ctx, input.domainId))),
  }),
  define({
    id: "removeDomain",
    method: "DELETE",
    path: "/domains/{domainId}",
    scope: "domains:write",
    tag: "Domains",
    summary: "Disconnect a custom domain",
    description:
      "Disconnects the domain from the storefront. When it was primary, another connected domain becomes primary.",
    destructive: true,
    input: z.object({ domainId: id("domain") }),
    actions: ["domains#removeDomain"],
    run: async (ctx, input) => {
      await removeDomain(ctx, await domain(ctx, input.domainId));
      return { removed: true };
    },
  }),
];
