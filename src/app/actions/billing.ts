"use server";

import { redirect } from "next/navigation";
import { getAgency } from "@/lib/data";
import { siteOrigin } from "@/lib/email";
import { billingPortalLink } from "@/lib/operations/billing";
import { assertAgencyAdmin } from "@/lib/session";

/** "Manage billing": the agency owner goes to the Stripe Customer Portal and comes back to the Billing page. */
export async function openBillingPortal(): Promise<void> {
  const user = await assertAgencyAdmin();
  const agency = await getAgency(user.agencyId);
  const url = agency ? await billingPortalLink(agency, user, await siteOrigin()) : null;
  if (!url) redirect("/app/billing?error=portal");
  redirect(url);
}
