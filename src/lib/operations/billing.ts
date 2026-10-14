import "server-only";
import { canStartCheckout, onTrial, startPlanCheckout } from "../billing";
import { COLLECTIONS, countActiveStoresForAgency, recordAudit } from "../data";
import { db } from "../mongo";
import { storeAllowance } from "../plans";
import { isBillingCycle, isSelfServePlan } from "../signup";
import { billingPortalUrl } from "../stripe";
import type { Agency, AgencyBilling, User } from "../types";

/**
 * The agency's plan payment: opening Stripe Checkout to add payment details,
 * and the Stripe billing portal. The billing page's actions and the Admin API
 * both run these; each answers with the address to send the owner to.
 */

type BillingAgency = Agency & { billing: AgencyBilling };

/** The Stripe Checkout page for the agency's plan, or null when Checkout cannot be opened. */
export async function checkoutLink(agency: BillingAgency, email: string, origin: string, locale: string): Promise<string | null> {
  const session = await startPlanCheckout({ agency, email, origin, locale });
  if (!session?.url) return null;
  await db.updateOne(COLLECTIONS.agencies, { id: agency.id }, { $set: { "billing.checkoutSessionId": session.id } });
  return session.url;
}

export type PaymentLinkResult =
  | { status: "ready"; url: string }
  /** Nothing to pay for now: the plan is active, or billed outside the workspace. */
  | { status: "not_needed" }
  | { status: "unavailable" };

/**
 * "Add payment details", during or after the free trial. During the trial the
 * plan can also be switched between the self-serve plans; the trial carries on
 * with the plan chosen, unless it allows fewer live stores than the agency
 * already runs. The cycle can be changed until the subscription starts.
 */
export async function startPayment(
  agency: Agency,
  owner: Pick<User, "email">,
  input: { cycle?: string; plan?: string },
  origin: string,
  locale: string,
): Promise<PaymentLinkResult> {
  if (!agency.billing || !canStartCheckout(agency)) return { status: "not_needed" };
  let billing = agency.billing;
  let agencyPlan = agency.plan;
  const changes: Record<string, string> = {};
  if (input.cycle && isBillingCycle(input.cycle) && input.cycle !== billing.cycle) {
    billing = { ...billing, cycle: input.cycle };
    changes["billing.cycle"] = input.cycle;
  }
  if (input.plan && onTrial(agency) && isSelfServePlan(input.plan) && input.plan !== billing.plan) {
    const allowance = storeAllowance(input.plan, await countActiveStoresForAgency(agency.id));
    if (allowance.limit === null || allowance.used <= allowance.limit) {
      billing = { ...billing, plan: input.plan };
      agencyPlan = input.plan;
      changes["billing.plan"] = input.plan;
      changes.plan = input.plan;
    }
  }
  if (Object.keys(changes).length > 0) await db.updateOne(COLLECTIONS.agencies, { id: agency.id }, { $set: changes });
  const url = await checkoutLink({ ...agency, plan: agencyPlan, billing }, owner.email, origin, locale);
  return url ? { status: "ready", url } : { status: "unavailable" };
}

/** The Stripe billing portal for the agency, recorded in its audit history. Null when it cannot be opened. */
export async function billingPortalLink(agency: Agency, actor: { id: string; name: string }, origin: string): Promise<string | null> {
  const customer = agency.billing?.stripeCustomerId;
  const url = customer ? await billingPortalUrl(customer, `${origin}/app/billing`) : null;
  if (!url) return null;
  recordAudit({
    category: "administration",
    action: "agency.billing_portal_opened",
    summary: `${actor.name} opened billing management`,
    agencyId: agency.id,
    actorId: actor.id,
    actorName: actor.name,
    entity: "agency",
    entityId: agency.id,
    meta: {},
  });
  return url;
}
