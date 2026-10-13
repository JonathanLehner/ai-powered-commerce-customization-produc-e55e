// Self-check for sign-in: npm run auth-check
//
// Email-only sign-in opens the seeded demo accounts and nothing else, and the
// server-minted ticket used after accepting an invitation cannot be forged,
// reused after it lapses, or pointed at another user.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = (path) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");

const { DEMO_PERSONAS, isDemoPersona, hasUsablePassword } = await import("../src/lib/demo-personas.ts");
assert.equal(DEMO_PERSONAS.length, 5);
assert.ok(isDemoPersona("alex@northlight.studio") && isDemoPersona(" OPS@parcelith.com "));
assert.equal(isDemoPersona("owner@real-agency.com"), false, "a real account is never email-only");
assert.equal(hasUsablePassword({ password: "$2b$10$abc" }), true);
assert.equal(hasUsablePassword({ password: "pw_abc123" }), false);

// The providers: persona refuses non-demo emails before any lookup; ticket reads a ticket.
const auth = source("src/auth.ts");
assert.match(auth, /if \(!email \|\| !isDemoPersona\(email\)\) return null;/);
assert.match(auth, /id: "ticket"/);
const actions = source("src/app/actions/auth.ts");
assert.match(actions, /signIn\("ticket", \{ ticket: await mintSignInTicket\(user\.id\)/);
assert.doesNotMatch(source("src/app/login/page.tsx"), /invitedEmail|signin-email/, "no email-only box on /login");

// Accepting an invitation sets a password before the account exists.
const team = source("src/app/actions/team.ts");
assert.ok(team.indexOf("MIN_PASSWORD_LENGTH") < team.indexOf("insertOne(COLLECTIONS.users"));
assert.doesNotMatch(team, /password: newId\("pw"\)/);

// Tickets.
process.env.AUTH_SECRET = "auth-check-secret";
const { mintSignInTicket, readSignInTicket } = await import("../src/lib/sign-in-token.ts");
const now = Date.now();
const ticket = await mintSignInTicket("usr_abc123", now);
assert.equal(await readSignInTicket(ticket, now + 1000), "usr_abc123");
assert.equal(await readSignInTicket(ticket, now + 61_000), null, "expires after a minute");
assert.equal(await readSignInTicket(ticket.replace("usr_abc123", "usr_victim1"), now), null, "bound to its user");
const [id, expires] = ticket.split(".");
assert.equal(await readSignInTicket(`${id}.${Number(expires) + 600_000}.${ticket.split(".")[2]}`, now), null, "expiry cannot be extended");
assert.equal(await readSignInTicket(`${id}.${expires}.${"0".repeat(64)}`, now), null, "forged signature");
assert.equal(await readSignInTicket("alex@northlight.studio", now), null);
process.env.AUTH_SECRET = "another-secret";
assert.equal(await readSignInTicket(ticket, now), null, "signed with this deployment's secret");

console.log("auth-check ok");
