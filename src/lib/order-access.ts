import "server-only";

/**
 * Shopper access to an order status page.
 *
 * Order codes are guessable enough to be a poor secret on their own, so the
 * page only opens for someone holding a signed link (issued at checkout) or
 * able to state the email address on the order.
 *
 * ponytail: HMAC keyed on the project key, no extra secret to provision. Move
 * to a dedicated ORDER_TOKEN_SECRET if the platform key ever has to rotate
 * without invalidating every confirmation link.
 */
const SECRET = process.env.CLAWCORP_API_KEY ?? "parcelith-dev-order-token";

async function mac(storeId: string, code: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${storeId}:${code}`));
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
    .slice(0, 32);
}

export function signOrderToken(storeId: string, code: string): Promise<string> {
  return mac(storeId, code);
}

export async function verifyOrderToken(
  storeId: string,
  code: string,
  token: string | undefined,
): Promise<boolean> {
  if (!token) return false;
  const expected = await mac(storeId, code);
  if (token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export function emailMatchesOrder(orderEmail: string, given: string): boolean {
  return orderEmail.trim().toLowerCase() === given.trim().toLowerCase();
}

export function orderStatusUrl(slug: string, code: string, token: string, extra = ""): string {
  return `/s/${slug}/orders/${encodeURIComponent(code)}?t=${token}${extra}`;
}
