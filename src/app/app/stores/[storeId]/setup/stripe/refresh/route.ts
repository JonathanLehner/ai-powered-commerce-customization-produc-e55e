import { NextResponse, type NextRequest } from "next/server";
import { recordAudit } from "@/lib/data";
import { requireStoreAccess } from "@/lib/session";
import { onboardingLink } from "@/lib/stripe";

/**
 * Stripe sends the administrator here when an onboarding link has expired or
 * was already used. A fresh link is made and they carry on where they were.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const { user, store } = await requireStoreAccess(storeId, "store.settings");
  const back = new URL(`/app/stores/${storeId}/setup/stripe`, request.url);
  const accountId = store.stripe.express ? store.stripe.accountId : null;
  const link = accountId ? await onboardingLink(accountId, `${back.href}/refresh`, back.href) : null;
  if (!link) return NextResponse.redirect(back, 303);
  recordAudit({
    category: "store_setup",
    action: "store.stripe_onboarding_refreshed",
    summary: `Reopened Stripe onboarding for ${accountId}`,
    storeId,
    agencyId: store.agencyId,
    actorId: user.id,
    actorName: user.name,
    entity: "store",
    entityId: storeId,
    meta: { accountId },
  });
  return NextResponse.redirect(link, 303);
}
