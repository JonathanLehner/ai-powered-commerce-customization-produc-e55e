import "server-only";

/**
 * A one-minute, single-purpose ticket that lets the server sign someone in
 * right after it has verified them another way (an invitation link). It is an
 * HMAC over the user id and expiry with AUTH_SECRET, so it cannot be written by
 * hand and is useless once it lapses.
 */

const LIFETIME_MS = 60 * 1000;

async function key(): Promise<CryptoKey> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set.");
  return crypto.subtle.importKey("raw", new TextEncoder().encode(`sign-in-ticket:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function mintSignInTicket(userId: string, now = Date.now()): Promise<string> {
  const payload = `${userId}.${now + LIFETIME_MS}`;
  const signature = await crypto.subtle.sign("HMAC", await key(), new TextEncoder().encode(payload));
  return `${payload}.${hex(signature)}`;
}

/** The user id the ticket was minted for, or null when it is forged, malformed or expired. */
export async function readSignInTicket(ticket: string, now = Date.now()): Promise<string | null> {
  const match = /^(usr_[A-Za-z0-9]+)\.(\d+)\.([0-9a-f]{64})$/.exec(ticket);
  if (!match) return null;
  const [, userId, expires, signature] = match;
  if (Number(expires) < now) return null;
  const bytes = new Uint8Array(signature.match(/../g)!.map((pair) => parseInt(pair, 16)));
  const valid = await crypto.subtle.verify("HMAC", await key(), bytes, new TextEncoder().encode(`${userId}.${expires}`));
  return valid ? userId : null;
}
