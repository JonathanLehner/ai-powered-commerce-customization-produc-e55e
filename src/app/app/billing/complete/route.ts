import { NextResponse, type NextRequest } from "next/server";
import { activateSubscription, getCheckoutSession } from "@/lib/billing";
import { getAgency } from "@/lib/data";
import { getSessionUser } from "@/lib/session";

/**
 * Stripe Checkout's success address. The session is read back from Stripe and
 * must belong to the signed-in owner's agency before the plan is switched on,
 * so the address alone proves nothing. The webhook does the same for an owner
 * who closes the tab; whichever runs second changes nothing.
 */
export async function GET(request: NextRequest) {
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url), 303);

  const user = await getSessionUser();
  if (!user) return to("/login");
  const agency = user.agencyId ? await getAgency(user.agencyId) : null;
  if (!agency?.billing) return to("/app");
  const trialing = agency.billing.status === "trialing";
  if (!trialing && agency.billing.status !== "pending") return to("/app/stores/new?welcome=1");

  const session = await getCheckoutSession(request.nextUrl.searchParams.get("session_id") ?? "");
  if (!session || session.client_reference_id !== agency.id || session.status !== "complete") {
    return to("/app/billing?error=payment");
  }

  await activateSubscription({ ...agency, billing: agency.billing }, session, user);
  // A trial owner already has a workspace, so they go back to their plan.
  return to(trialing ? "/app/billing" : "/app/stores/new?welcome=1");
}
