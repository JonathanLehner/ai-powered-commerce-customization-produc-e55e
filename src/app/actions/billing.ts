"use server";

import { redirect } from "next/navigation";
import { getAgency, recordAudit } from "@/lib/data";
import { siteOrigin } from "@/lib/email";
import { assertAgencyAdmin } from "@/lib/session";
import { billingPortalUrl } from "@/lib/stripe";

/** "Manage billing": the agency owner goes to the Stripe Customer Portal and comes back to the Billing page. */
export async function openBillingPortal(): Promise<void> {
  const user = await assertAgencyAdmin();
  const agency = await getAgency(user.agencyId);
  const customer = agency?.billing?.stripeCustomerId;
  const url = customer ? await billingPortalUrl(customer, `${await siteOrigin()}/app/billing`) : null;
  if (!agency || !url) redirect("/app/billing?error=portal");
  recordAudit({
    category: "administration",
    action: "agency.billing_portal_opened",
    summary: `${user.name} opened billing management`,
    agencyId: agency.id,
    actorId: user.id,
    actorName: user.name,
    entity: "agency",
    entityId: agency.id,
    meta: {},
  });
  redirect(url);
}
