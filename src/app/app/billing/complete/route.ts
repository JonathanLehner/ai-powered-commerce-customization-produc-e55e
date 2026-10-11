import { NextResponse, type NextRequest } from "next/server";
import { getCheckoutSession } from "@/lib/billing";
import { COLLECTIONS, getAgency, recordAudit } from "@/lib/data";
import { db } from "@/lib/mongo";
import { getSessionUser } from "@/lib/session";

/**
 * Stripe Checkout's success address. The session is read back from Stripe and
 * must belong to the signed-in owner's agency before the plan is switched on,
 * so the address alone proves nothing. Running it twice is harmless.
 */
export async function GET(request: NextRequest) {
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url), 303);

  const user = await getSessionUser();
  if (!user) return to("/login");
  const agency = user.agencyId ? await getAgency(user.agencyId) : null;
  if (!agency?.billing) return to("/app");
  if (agency.billing.status === "active") return to("/app/stores/new?welcome=1");

  const session = await getCheckoutSession(request.nextUrl.searchParams.get("session_id") ?? "");
  if (!session || session.client_reference_id !== agency.id || session.status !== "complete") {
    return to("/app/billing?error=payment");
  }

  const activatedAt = new Date().toISOString();
  await db.updateOne(
    COLLECTIONS.agencies,
    { id: agency.id },
    {
      $set: {
        plan: agency.billing.plan,
        "billing.status": "active",
        "billing.checkoutSessionId": session.id,
        "billing.stripeCustomerId": session.customer,
        "billing.stripeSubscriptionId": session.subscription,
        "billing.activatedAt": activatedAt,
      },
    },
  );
  recordAudit({
    category: "administration",
    action: "agency.subscribed",
    summary: `Subscribed ${agency.name} to the ${agency.billing.plan} plan, billed ${agency.billing.cycle}`,
    agencyId: agency.id,
    actorId: user.id,
    actorName: user.name,
    entity: "agency",
    entityId: agency.id,
    meta: { plan: agency.billing.plan, cycle: agency.billing.cycle, currency: agency.billing.currency },
  });
  return to("/app/stores/new?welcome=1");
}
