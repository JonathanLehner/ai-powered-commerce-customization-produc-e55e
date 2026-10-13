// Self-check for sign-in: npm run auth-check
//
// Email-only sign-in opens the seeded demo accounts and nothing else, the
// server-minted ticket used after accepting an invitation cannot be forged,
// reused after it lapses, or pointed at another user, and "Forgot password?"
// answers the same whether or not an account exists.
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

// Password reset.
const login = source("src/app/login/page.tsx");
assert.match(login, /href="\/login\/forgot"/, "a Forgot password? link on /login");
const request = actions.slice(actions.indexOf("export async function requestPasswordReset"), actions.indexOf("export async function resetPassword"));
const reset = actions.slice(actions.indexOf("export async function resetPassword"));
assert.equal((request.match(/redirect\("\/login\/forgot\?sent=1"\)/g) ?? []).length, 1, "one neutral answer");
assert.doesNotMatch(request, /redirect\([^)]*(unknown|no-account)/, "never says whether an account exists");
assert.match(request, /allowResetRequest\(`email:\$\{email\}`/, "limited per email");
assert.match(request, /allowResetRequest\(`ip:\$\{ip\}`/, "limited per IP");
assert.match(request, /sendEmail\(/);
assert.match(request, /user\.uiLanguage/, "in the person's workspace language");
assert.match(request, /user\.password_reset_requested/);
assert.ok(reset.indexOf("MIN_PASSWORD_LENGTH") < reset.indexOf("consumeResetToken("), "a short password does not use the link up");
assert.ok(reset.indexOf("consumeResetToken(") < reset.indexOf("hash(password"), "the link is used up before the password changes");
assert.match(reset, /user\.password_reset"/);
assert.match(reset, /signIn\("ticket"/, "signs the person in afterwards");
assert.doesNotMatch(reset, /hasUsablePassword/, "an invited account with a placeholder password can set its first one");
const resets = source("src/lib/password-reset.ts");
assert.match(resets, /RESET_LINK_MINUTES = 60;/, "links expire after one hour");
assert.match(resets, /useVerificationToken/, "consumed once, atomically, by the adapter");
assert.ok(
  resets.indexOf("deleteMany(COLLECTIONS.passwordResetTokens") < resets.indexOf("createVerificationToken"),
  "a new link invalidates older ones",
);
const { parseResetToken } = await import("../src/lib/password-reset.ts");
assert.deepEqual(parseResetToken(`usr_abc123.${"a".repeat(64)}`), { userId: "usr_abc123", token: "a".repeat(64) });
assert.equal(parseResetToken(`usr_abc123.${"a".repeat(63)}`), null);
assert.equal(parseResetToken(`alex@northlight.studio.${"a".repeat(64)}`), null);

console.log("auth-check ok");
