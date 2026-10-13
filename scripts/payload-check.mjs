// Page weight and response-time check against a running site: npm run payload-check
//
// Signs in as the demo agency director, requests each page RUNS times and
// fails when a page is not a 200, or its server-rendered HTML (markup plus the
// inline component payload) is over its budget. Response times are printed so
// a deploy can be compared with the one before it; they are not asserted,
// because they depend on the network the check runs from.
//
//   BASE_URL=http://localhost:3000 npm run payload-check
//   RUNS=10 npm run payload-check            (the deployed site by default)
const BASE = (process.env.BASE_URL ?? "https://ai-powered-commerce-customization-produc-e55e.clawcorp.ai").replace(/\/$/, "");
const RUNS = Number(process.env.RUNS ?? 3);
const PERSONA = process.env.PERSONA ?? "alex@northlight.studio";
const KB = 1024;

/**
 * Budgets in bytes of HTML. A workspace page sends its markup, the component
 * payload React hydrates from and the messages its client components read; on
 * 13 October they ran from 340 to 560 KB, mostly whole records and every
 * message the app has. The Orders queue (25 rows) and store Settings render the
 * most markup, so they get more room.
 */
const WORKSPACE = 288 * KB;
const DENSE = 352 * KB;
const STOREFRONT = 200 * KB;
const PAGES = [
  ["/login", WORKSPACE],
  ["/app", WORKSPACE],
  ["/app/attention", WORKSPACE],
  ["/app/people", WORKSPACE],
  ["/app/stores/str_northwind", WORKSPACE],
  ["/app/stores/str_northwind/orders", DENSE],
  ["/app/stores/str_northwind/catalog", WORKSPACE],
  ["/app/stores/str_northwind/analytics", WORKSPACE],
  ["/app/stores/str_northwind/activity", WORKSPACE],
  ["/app/stores/str_northwind/customers", WORKSPACE],
  ["/app/stores/str_northwind/setup", DENSE],
  ["/s/northwind-supply", STOREFRONT],
  ["/s/northwind-supply/products/northwind-field-tee", STOREFRONT],
  ["/s/northwind-supply/products", STOREFRONT],
];

const jar = new Map();
function remember(response) {
  for (const line of response.headers.getSetCookie()) {
    const [pair] = line.split(";");
    const eq = pair.indexOf("=");
    jar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
}
const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

async function signIn() {
  const csrfResponse = await fetch(`${BASE}/api/auth/csrf`);
  remember(csrfResponse);
  const { csrfToken } = await csrfResponse.json();
  const response = await fetch(`${BASE}/api/auth/callback/persona`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookie() },
    body: new URLSearchParams({ csrfToken, email: PERSONA, callbackUrl: `${BASE}/app` }),
  });
  remember(response);
  if (![...jar.keys()].some((name) => name.includes("session-token"))) throw new Error(`Sign-in as ${PERSONA} failed`);
}

async function load(path) {
  const started = performance.now();
  const response = await fetch(`${BASE}${path}`, { redirect: "manual", headers: { cookie: cookie() } });
  const body = await response.text();
  return { status: response.status, ms: performance.now() - started, bytes: Buffer.byteLength(body) };
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

await signIn();
const failures = [];
console.log(`${BASE}, ${RUNS} runs per page\n`);
console.log("page".padEnd(52), "ok".padStart(6), "median".padStart(8), "max".padStart(8), "KB".padStart(7), "budget".padStart(7));
for (const [path, budget] of PAGES) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) runs.push(await load(path));
  const ok = runs.filter((r) => r.status === 200).length;
  const bytes = Math.max(...runs.map((r) => r.bytes));
  console.log(
    path.padEnd(52),
    `${ok}/${RUNS}`.padStart(6),
    `${Math.round(median(runs.map((r) => r.ms)))}ms`.padStart(8),
    `${Math.round(Math.max(...runs.map((r) => r.ms)))}ms`.padStart(8),
    (bytes / KB).toFixed(0).padStart(7),
    (budget / KB).toFixed(0).padStart(7),
  );
  const statuses = [...new Set(runs.filter((r) => r.status !== 200).map((r) => r.status))];
  if (statuses.length) failures.push(`${path}: ${RUNS - ok} of ${RUNS} responses were ${statuses.join(", ")}`);
  if (bytes > budget) failures.push(`${path}: ${(bytes / KB).toFixed(0)} KB of HTML, budget ${budget / KB} KB`);
}

if (failures.length) {
  console.error(`\n${failures.length} problem(s):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("\nEvery page answered and stayed within its budget.");
