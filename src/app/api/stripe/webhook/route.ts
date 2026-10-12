import { NextResponse, type NextRequest } from "next/server";
import { handleStripeWebhook } from "@/lib/stripe-webhook";

/**
 * Stripe's webhook endpoint, for events on Parcelith's own account and on
 * connected accounts. The raw body is what the signature covers, so it is read
 * as text and handed over untouched.
 */
export async function POST(request: NextRequest) {
  const { status, body } = await handleStripeWebhook(await request.text(), request.headers.get("stripe-signature"));
  return NextResponse.json(body, { status });
}
