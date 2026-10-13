// Self-check for custom domains: npm run domains-check
//
// Runs the real domain operations against throwaway stores in the development
// database, with Cloudflare's API replaced by an in-memory zone. Cloudflare is
// never called: the SDK is handed the mock, the real token in .env.local is
// overwritten with a fake one, and any other network call fails the check.
//
// It asserts that:
// - host names are cleaned up, clawcorp.ai and anything under it is refused,
//   and www / root pairs, DNS records and Cloudflare statuses read correctly;
// - a domain is connected as a custom hostname with HTTP DV validation and a
//   Worker route `{hostname}/*` for this app's Worker, and both ids are recorded;
// - a host name already on the shared zone (as a custom hostname or under any
//   Worker route) is refused before anything is created;
// - two stores, a double click or two requests at once never create anything twice;
// - when the route cannot be made, the hostname just created is taken down again;
// - only ids the app recorded are ever deleted, each read back first; nothing
//   is ever edited; another site's hostnames and routes are never touched;
// - with the settings missing a domain is saved as setup pending without a
//   single call, and connects on its next check once they are there;
// - the store mirrors the primary domain, which canonical links and emails use;
// - an API key works on domains only while its maker administers the store.
//
// It needs MONGODB_URI and MONGODB_DB from `.env.local`, and refuses to run against production.
import assert from "node:assert/strict";
import { PRODUCTION_DB } from "./mongo.mjs";

if (!process.env.MONGODB_DB || process.env.MONGODB_DB === PRODUCTION_DB) {
  console.error("domains-check writes test data: set MONGODB_DB to the development database (see .env.local).");
  process.exit(1);
}

/* ------------------------------------------------- never the real Cloudflare */

const ENV = {
  CLOUDFLARE_SAAS_API_TOKEN: "domains-check-fake-token",
  CLOUDFLARE_ZONE_ID: "zone_check",
  CLOUDFLARE_SAAS_CNAME_TARGET: "customers.clawcorp.ai",
  CLOUDFLARE_WORKER_NAME: "parcelith-worker",
};
Object.assign(process.env, ENV);
let strayCalls = 0;
globalThis.fetch = async (url) => {
  strayCalls += 1;
  throw new Error(`domains-check makes no network calls (${url})`);
};

/** The shared zone, as Cloudflare would hold it. Another site's records are already there. */
const zone = {
  hostnames: new Map([
    ["ch_foreign", { id: "ch_foreign", hostname: "shop.othersite.com", status: "active", ssl: { status: "active" } }],
  ]),
  routes: new Map([
    ["rt_foreign", { id: "rt_foreign", pattern: "blog.othersite.com/*", script: "another-worker" }],
    ["rt_wild", { id: "rt_wild", pattern: "*.partner.io/*", script: "partner-worker" }],
  ]),
  requests: [],
  failRoutes: false,
  next: 0,
};
const FOREIGN = new Set(["ch_foreign", "rt_foreign", "rt_wild"]);

function envelope(result, status = 200, extra = {}) {
  const body = status < 400
    ? { success: true, errors: [], messages: [], result, ...extra }
    : { success: false, errors: [{ code: 1000, message: result }], messages: [], result: null };
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function mockCloudflare(input, init = {}) {
  const url = new URL(String(input));
  const method = (init.method ?? "GET").toUpperCase();
  const body = init.body ? JSON.parse(String(init.body)) : null;
  zone.requests.push({ method, path: url.pathname, search: url.search, body });
  assert.equal(url.origin, "https://api.cloudflare.com", "only the Cloudflare API is asked");
  const auth = new Headers(init.headers).get("authorization");
  assert.equal(auth, `Bearer ${ENV.CLOUDFLARE_SAAS_API_TOKEN}`, "with the configured token");
  const parts = url.pathname.replace("/client/v4/", "").split("/");
  assert.equal(parts[0], "zones");
  assert.equal(parts[1], ENV.CLOUDFLARE_ZONE_ID, "on the configured zone");
  const [, , resource, sub, id] = parts;

  if (resource === "custom_hostnames") {
    const hostnameId = sub;
    if (!hostnameId && method === "GET") {
      const wanted = [...url.searchParams.entries()].find(([key]) => key.startsWith("hostname"))?.[1];
      const result = [...zone.hostnames.values()].filter((h) => !wanted || h.hostname === wanted);
      return envelope(result, 200, { result_info: { page: 1, per_page: 50, count: result.length, total_count: result.length, total_pages: 1 } });
    }
    if (!hostnameId && method === "POST") {
      assert.deepEqual(body.ssl, { method: "http", type: "dv" }, "HTTP DV certificate validation");
      const created = {
        id: `ch_${++zone.next}`,
        hostname: body.hostname,
        status: "pending",
        ssl: { status: "pending_validation", method: "http", type: "dv" },
        ownership_verification: { type: "txt", name: `_cf-custom-hostname.${body.hostname}`, value: `token-${zone.next}` },
      };
      zone.hostnames.set(created.id, created);
      return envelope(created);
    }
    const found = zone.hostnames.get(hostnameId);
    if (!found) return envelope("Custom hostname not found", 404);
    if (method === "GET") return envelope(found);
    if (method === "DELETE") {
      zone.hostnames.delete(hostnameId);
      return envelope({ id: hostnameId });
    }
  }
  if (resource === "workers" && sub === "routes") {
    if (!id && method === "GET") return envelope([...zone.routes.values()]);
    if (!id && method === "POST") {
      if (zone.failRoutes) return envelope("Route could not be created", 500);
      assert.equal(body.script, ENV.CLOUDFLARE_WORKER_NAME, "the route points at this app's Worker");
      const created = { id: `rt_${++zone.next}`, pattern: body.pattern, script: body.script };
      zone.routes.set(created.id, created);
      return envelope(created);
    }
    const found = zone.routes.get(id);
    if (!found) return envelope("Route not found", 404);
    if (method === "GET") return envelope(found);
    if (method === "DELETE") {
      zone.routes.delete(id);
      return envelope({ id });
    }
  }
  throw new Error(`unexpected Cloudflare request ${method} ${url.pathname}`);
}
globalThis[Symbol.for("parcelith.cloudflare-fetch")] = mockCloudflare;

const requestsSince = (mark, filter = () => true) => zone.requests.slice(mark).filter(filter);
const writes = (mark) => requestsSince(mark, (r) => r.method !== "GET");

/* ------------------------------------------------------------------- rules */

const domains = await import("../src/lib/domains.ts");
assert.equal(domains.normalizeHostname(" https://Shop.Example.com/products?x=1 "), "shop.example.com");
assert.equal(domains.normalizeHostname("example.com."), "example.com");
assert.equal(domains.normalizeHostname("bücher.de"), "xn--bcher-kva.de", "international names in punycode");
for (const bad of ["", "localhost", "192.168.0.1", "exa mple.com", "-bad.com", "a@b.com", "http://"]) {
  assert.equal(domains.normalizeHostname(bad), null, `"${bad}" is not a domain`);
}
assert.ok(domains.isReservedHostname("clawcorp.ai") && domains.isReservedHostname("shop.clawcorp.ai"));
assert.ok(!domains.isReservedHostname("notclawcorp.ai"), "only clawcorp.ai and below");
assert.ok(domains.isApexDomain("example.com") && domains.isApexDomain("example.co.uk"));
assert.ok(!domains.isApexDomain("www.example.com") && !domains.isApexDomain("shop.example.co.uk"));
assert.equal(domains.companionHostname("example.com"), "www.example.com");
assert.equal(domains.companionHostname("www.example.co.uk"), "example.co.uk");
assert.equal(domains.companionHostname("shop.example.com"), null);
assert.deepEqual(domains.dnsRecordFor("shop.example.co.uk", "customers.clawcorp.ai"), {
  type: "CNAME", name: "shop", value: "customers.clawcorp.ai", apex: false,
});
assert.deepEqual(domains.dnsRecordFor("example.com", "customers.clawcorp.ai"), {
  type: "ALIAS", name: "@", value: "customers.clawcorp.ai", apex: true,
}, "a root domain is told to use ALIAS / flattening");
assert.ok(domains.routeCovers("*.partner.io/*", "news.partner.io") && domains.routeCovers("a.com/*", "a.com"));
assert.ok(!domains.routeCovers("a.com/*", "b.a.com"));
assert.equal(domains.domainStatusFrom({ status: "active", ssl: { status: "active" } }), "active");
assert.equal(domains.domainStatusFrom({ status: "active", ssl: { status: "pending_validation" } }), "pending");
assert.equal(domains.domainStatusFrom({ status: "pending", ssl: { status: "validation_timed_out" } }), "failed");
assert.equal(domains.domainStatusFrom({ status: "blocked" }), "failed");

/* --------------------------------------------------------- against the db */

const { db, mongoClient, mongoDatabaseName } = await import("../src/lib/mongo.ts");
const { ensureIndexes } = await import("../src/lib/db-indexes.ts");
// The unique index on a domain's host name is what settles two claims at once.
await ensureIndexes((await mongoClient()).db(mongoDatabaseName()));
const { COLLECTIONS, getStore, getStoreByDomain } = await import("../src/lib/data.ts");
const ops = await import("../src/lib/operations/domains.ts");
const { storeHome, storeLinkBase } = await import("../src/lib/seo.ts");
const { authorize } = await import("../src/lib/api/http.ts");
const { findOperation } = await import("../src/lib/api/operations.ts");

const quiet = console.error;
console.error = () => {};

const RUN = `dom${Date.now().toString(36)}`;
const template = (await db.findOne(COLLECTIONS.stores, { id: "str_northwind" })) ?? (await db.findOne(COLLECTIONS.stores, { status: "active" }));
assert.ok(template, "the development database has a store (npm run seed)");
const makeStore = async (suffix) => {
  const store = { ...template, id: `str_${RUN}_${suffix}`, slug: `domains-check-${RUN}-${suffix}`, customDomain: null, domainStatus: "unset", domainHosts: [] };
  delete store._id;
  await db.insertOne(COLLECTIONS.stores, store);
  return store;
};
const store = await makeStore("a");
const other = await makeStore("b");
const actor = { id: "usr_domains_check", name: "Domains Check" };
const ctxFor = async (s) => ({ store: (await getStore(s.id)) ?? s, actor, locale: "en" });
const refusal = async (promise) => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail("expected a refusal");
};

const apex = `example-${RUN}.com`;
const www = `www.${apex}`;

try {
  /* ------------------------------------------------------------ refusals */

  let mark = zone.requests.length;
  for (const reserved of ["clawcorp.ai", "shop.clawcorp.ai", "https://store.CLAWCORP.ai/"]) {
    const error = await refusal(ops.connectDomain(await ctxFor(store), { hostname: reserved }));
    assert.equal(error.code, "invalid", `${reserved} is refused`);
  }
  assert.equal(zone.requests.length, mark, "a clawcorp.ai address never reaches Cloudflare");

  mark = zone.requests.length;
  const onZone = await refusal(ops.connectDomain(await ctxFor(store), { hostname: "SHOP.othersite.com" }));
  assert.equal(onZone.code, "conflict", "a hostname another site has on the zone is refused");
  const underRoute = await refusal(ops.connectDomain(await ctxFor(store), { hostname: "news.partner.io" }));
  assert.equal(underRoute.code, "conflict", "a hostname under another site's Worker route is refused");
  assert.equal(writes(mark).length, 0, "nothing is created for a refused hostname");
  assert.equal(await db.count(COLLECTIONS.storeDomains, { storeId: store.id }), 0, "and nothing is recorded");

  /* --------------------------------------------------------- connecting */

  mark = zone.requests.length;
  const connected = await ops.connectDomain(await ctxFor(store), { hostname: apex, includeCompanion: true });
  assert.deepEqual(connected.map((d) => d.hostname), [apex, www], "the root and www are connected together");
  const created = writes(mark);
  assert.deepEqual(
    created.map((r) => `${r.method} ${r.path.split("/").slice(-1)[0]} ${r.body.hostname ?? r.body.pattern}`),
    [
      `POST custom_hostnames ${apex}`,
      `POST routes ${apex}/*`,
      `POST custom_hostnames ${www}`,
      `POST routes ${www}/*`,
    ],
    "a custom hostname, then its Worker route, per domain",
  );
  const rows = await ops.listDomains(store.id);
  for (const row of rows) {
    assert.ok(zone.hostnames.get(row.cloudflare.customHostnameId)?.hostname === row.hostname, "the hostname id is recorded");
    assert.equal(zone.routes.get(row.cloudflare.workerRouteId)?.pattern, `${row.hostname}/*`, "the route id is recorded");
    assert.equal(row.status, "pending");
    assert.ok(row.ownership?.name.startsWith("_cf-custom-hostname."), "Cloudflare's TXT record is kept to show");
  }
  assert.equal(rows.find((row) => row.primary)?.hostname, apex, "the first domain is primary");
  let saved = await getStore(store.id);
  assert.deepEqual(saved.domainHosts.sort(), [apex, www].sort(), "the store finds itself by either host");
  assert.equal(saved.customDomain, apex);
  assert.equal(saved.domainStatus, "pending");
  assert.equal(storeHome(saved).root, `/s/${saved.slug}`, "not canonical on the domain before it serves");
  assert.equal((await getStoreByDomain(www))?.id, store.id, "a request to www finds the store");

  mark = zone.requests.length;
  const again = await refusal(ops.connectDomain(await ctxFor(store), { hostname: apex }));
  assert.equal(again.code, "conflict", "connecting it twice is refused");
  const elsewhere = await refusal(ops.connectDomain(await ctxFor(other), { hostname: www }));
  assert.equal(elsewhere.code, "conflict", "another store cannot take it");
  assert.equal(writes(mark).length, 0, "and nothing is created on Cloudflare");

  // Two requests at once: one claim wins, one hostname is created.
  const race = `race-${RUN}.com`;
  mark = zone.requests.length;
  const results = await Promise.allSettled([
    ops.connectDomain(await ctxFor(store), { hostname: race }),
    ops.connectDomain(await ctxFor(other), { hostname: race }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1, "exactly one of two simultaneous claims wins");
  assert.equal(writes(mark).filter((r) => r.body?.hostname === race).length, 1, "one custom hostname is created");
  assert.equal(await db.count(COLLECTIONS.storeDomains, { hostname: race }), 1);

  /* --------------------------------------------------- route rollback */

  const rollback = `rollback-${RUN}.com`;
  zone.failRoutes = true;
  mark = zone.requests.length;
  const failed = await refusal(ops.connectDomain(await ctxFor(store), { hostname: rollback }));
  zone.failRoutes = false;
  assert.equal(failed.code, "conflict", "a failed route is reported");
  const made = writes(mark).find((r) => r.method === "POST" && r.body?.hostname === rollback);
  assert.ok(made, "the hostname had been created");
  assert.ok(![...zone.hostnames.values()].some((h) => h.hostname === rollback), "and is taken down again");
  assert.equal(await db.count(COLLECTIONS.storeDomains, { hostname: rollback }), 0, "with no record left behind");

  /* ------------------------------------------------- verification status */

  for (const row of rows) {
    const record = zone.hostnames.get(row.cloudflare.customHostnameId);
    record.status = "active";
    record.ssl = { status: "active" };
    delete record.ownership_verification;
  }
  mark = zone.requests.length;
  const refreshed = await ops.refreshDomains(await ctxFor(store));
  assert.ok(refreshed.filter((d) => d.hostname === apex || d.hostname === www).every((d) => d.status === "active"), "live status is read back");
  assert.equal(writes(mark).length, 0, "checking a domain changes nothing on Cloudflare");
  saved = await getStore(store.id);
  assert.equal(saved.domainStatus, "verified", "the primary domain is verified once it serves");
  assert.deepEqual(storeHome(saved), { origin: `https://${apex}`, root: "" }, "and canonical on it");
  assert.equal(storeLinkBase(saved, saved.defaultLanguage, "https://platform.example"), `https://${apex}`, "emails link to it");
  assert.equal(saved.setup.domain, true, "the setup step is done");

  const wwwRow = (await ops.listDomains(store.id)).find((d) => d.hostname === www);
  await ops.setPrimaryDomain(await ctxFor(store), wwwRow);
  saved = await getStore(store.id);
  assert.equal(saved.customDomain, www, "the primary domain can move to www");

  /* ------------------------------------------- only what it created */

  // The recorded hostname id now names something else: it is left alone.
  const raceRow = (await ops.listDomains(store.id)).find((d) => d.hostname === race) ??
    (await ops.listDomains(other.id)).find((d) => d.hostname === race);
  const raceStore = raceRow.storeId === store.id ? store : other;
  zone.hostnames.get(raceRow.cloudflare.customHostnameId).hostname = "taken-over.othersite.com";
  mark = zone.requests.length;
  await ops.removeDomain(await ctxFor(raceStore), raceRow);
  assert.ok(zone.hostnames.has(raceRow.cloudflare.customHostnameId), "a hostname that is no longer what was created is not deleted");
  assert.ok(!zone.routes.has(raceRow.cloudflare.workerRouteId), "its own route is");
  assert.ok(
    writes(mark).every((r) => r.method === "DELETE" && r.path.endsWith(raceRow.cloudflare.workerRouteId)),
    "only the recorded route was deleted",
  );

  mark = zone.requests.length;
  const apexRow = (await ops.listDomains(store.id)).find((d) => d.hostname === apex);
  await ops.removeDomain(await ctxFor(store), apexRow);
  const deleted = writes(mark).map((r) => r.path.split("/").pop());
  assert.deepEqual(deleted.sort(), [apexRow.cloudflare.customHostnameId, apexRow.cloudflare.workerRouteId].sort(), "removal deletes exactly the recorded ids");
  assert.ok(requestsSince(mark).filter((r) => r.method === "GET").length >= 2, "each read back before it is deleted");
  saved = await getStore(store.id);
  assert.deepEqual(saved.domainHosts, [www], "the removed host no longer finds the store");

  /* ---------------------------------------------- settings missing */

  delete process.env.CLOUDFLARE_SAAS_API_TOKEN;
  mark = zone.requests.length;
  const pendingHost = `pending-${RUN}.com`;
  const [pending] = await ops.connectDomain(await ctxFor(other), { hostname: pendingHost });
  assert.equal(pending.status, "pending_setup", "without the settings the domain waits as setup pending");
  assert.equal(zone.requests.length, mark, "and Cloudflare is not asked");
  const untouched = await ops.refreshDomain(await ctxFor(other), pending);
  assert.equal(untouched.status, "pending_setup", "checking it changes nothing until the settings are there");
  process.env.CLOUDFLARE_SAAS_API_TOKEN = ENV.CLOUDFLARE_SAAS_API_TOKEN;
  const provisioned = await ops.refreshDomain(await ctxFor(other), pending);
  assert.equal(provisioned.status, "pending", "with the settings in place it connects on its next check");
  assert.ok(provisioned.cloudflare.customHostnameId && provisioned.cloudflare.workerRouteId);

  /* ---------------------------------------------------- never another site's */

  assert.ok(zone.hostnames.has("ch_foreign") && zone.routes.has("rt_foreign") && zone.routes.has("rt_wild"), "another site's records are all still there");
  for (const request of zone.requests) {
    assert.ok(["GET", "POST", "DELETE"].includes(request.method), `nothing is ever edited (${request.method} ${request.path})`);
    if (request.method === "DELETE") assert.ok(!FOREIGN.has(request.path.split("/").pop()), "nothing of another site's is deleted");
  }

  /* ------------------------------------------------------- the API key rule */

  const connectOp = findOperation("connectDomain");
  const listOp = findOperation("listDomains");
  const memberships = await db.find(COLLECTIONS.memberships, { storeId: template.id, status: "active" });
  const admin =
    (await db.findOne(COLLECTIONS.users, { platformRole: "agency_admin", agencyId: store.agencyId })) ?? null;
  const viewerMembership = memberships.find((m) => m.role !== "store_admin" && m.userId);
  const caller = (createdById, s = store) => ({ key: { id: "key_check", scopes: ["domains:write"], createdById, storeId: s.id }, store: s, headers: {} });
  const strangerDenied = await authorize(caller("usr_nobody"), connectOp);
  assert.equal(strangerDenied?.status, 403, "a key whose maker does not administer the store cannot touch domains");
  assert.equal((await authorize(caller("usr_nobody"), listOp))?.status, 403, "nor read them");
  if (admin) assert.equal(await authorize(caller(admin.id), connectOp), null, "a store administrator's key can");
  if (viewerMembership) {
    const asTemplate = { ...store, id: template.id };
    assert.equal((await authorize(caller(viewerMembership.userId, asTemplate), connectOp))?.status, 403, "a team member who is not an administrator cannot");
  }

  assert.equal(strayCalls, 0, "no request left the process");
  console.error = quiet;
  console.log(
    `domains-check ok: ${zone.requests.length} Cloudflare requests, all mocked; ${zone.requests.filter((r) => r.method === "DELETE").length} deletes, each of an id this app recorded`,
  );
} finally {
  console.error = quiet;
  const ids = [store.id, other.id];
  await db.deleteMany(COLLECTIONS.storeDomains, { storeId: { $in: ids } });
  await db.deleteMany(COLLECTIONS.stores, { id: { $in: ids } });
  await db.deleteMany(COLLECTIONS.audit, { storeId: { $in: ids } });
}
process.exit(0);
