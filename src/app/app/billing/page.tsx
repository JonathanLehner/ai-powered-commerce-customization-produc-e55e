import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { openBillingPortal } from "@/app/actions/billing";
import { continueToPayment } from "@/app/actions/signup";
import { AppHeader } from "@/components/AppHeader";
import { SubmitButton } from "@/components/forms";
import { Badge, Callout, DataList, PageHeader } from "@/components/ui";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { TRIAL_DAYS, billingPending, firstChargeAt, onTrial } from "@/lib/billing";
import { countActiveStoresForAgency } from "@/lib/data";
import { planStoresText } from "@/i18n/plan-copy";
import { nextInvoice } from "@/lib/stripe";
import type { Agency, User } from "@/lib/types";
import { formatMoney } from "@/lib/util";
import { PLANS, YEARLY_DISCOUNT, planPrice, type BillingCycle } from "@/lib/plans";
import { SELF_SERVE_PLANS } from "@/lib/signup";
import { accessibleStores, getAgencyForRender, requireUser } from "@/lib/session";

const CYCLES: BillingCycle[] = ["monthly", "yearly"];

/**
 * The agency's plan and billing. An owner whose free trial has ended (or who
 * signed up card-first and never paid) finishes checkout here; everyone else
 * sees the plan, the trial or next invoice, and the way to add payment
 * details or into the Stripe Customer Portal.
 */
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; cancelled?: string }>;
}) {
  const { error, cancelled } = await searchParams;
  const user = await requireUser();
  const agency = user.agencyId ? await getAgencyForRender(user.agencyId) : null;
  if (!agency) redirect("/app");
  if (!billingPending(agency)) return <PlanBilling user={user} agency={agency} error={error} />;
  if (!agency.billing) redirect("/app");

  const trialEnded = onTrial(agency);
  // After a trial the stores stay open read-only, so the switcher lists them.
  const [t, format, stores] = await Promise.all([
    getTranslations("billing"),
    getFormatter(),
    trialEnded ? accessibleStores(user) : Promise.resolve([]),
  ]);
  const { plan: planKey, cycle, currency } = agency.billing;
  const plan = PLANS[planKey];
  const money = (amount: number) => format.number(amount, { style: "currency", currency, maximumFractionDigits: 0 });

  return (
    <>
      <AppHeader user={user} stores={stores} />
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-7 sm:px-6">
        <PageHeader title={trialEnded ? t("trialEndedTitle") : t("title")} description={agency.name} />

        <div className="mt-6 space-y-5">
          {trialEnded ? <Callout tone="amber">{t("trialEndedBody")}</Callout> : null}
          {error === "unavailable" ? (
            <Callout tone="amber" title={t("unavailableTitle")}>
              {t("unavailableBody")}
            </Callout>
          ) : error === "payment" ? (
            <Callout tone="amber" title={t("unconfirmedTitle")}>
              {t("unconfirmedBody")}
            </Callout>
          ) : cancelled ? (
            <Callout tone="neutral">{t("cancelled")}</Callout>
          ) : null}

          {user.platformRole === "agency_admin" ? (
            <Card asChild>
              <form action={continueToPayment}>
                <CardContent>
                  <h2 className="text-sm font-semibold text-foreground">{t("plan", { plan: plan.name })}</h2>
                  <fieldset className="mt-4">
                    <legend className="mb-3 text-sm leading-none font-medium text-foreground select-none">
                      {t("billingPeriod")}
                    </legend>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {CYCLES.map((option) => {
                        const price = planPrice(plan, option, currency)!;
                        return (
                          <Label
                            key={option}
                            className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3.5 font-normal hover:border-primary/40 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                          >
                            <input
                              type="radio"
                              name="cycle"
                              value={option}
                              defaultChecked={option === cycle}
                              className="mt-1 size-4 accent-primary"
                            />
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold text-foreground">{t(option)}</span>
                              <span className="mt-1 block text-xs text-muted-foreground">
                                {option === "yearly"
                                  ? t("yearlyPrice", { amount: money(price.billed) })
                                  : t("monthlyPrice", { amount: money(price.billed) })}
                              </span>
                            </span>
                          </Label>
                        );
                      })}
                    </div>
                  </fieldset>
                  {trialEnded ? null : (
                    <p className="mt-4 text-sm text-muted-foreground">{t("trial", { days: TRIAL_DAYS })}</p>
                  )}
                  <div className="mt-5">
                    <SubmitButton pendingLabel={t("opening")}>{t("proceed")}</SubmitButton>
                  </div>
                </CardContent>
              </form>
            </Card>
          ) : (
            <Callout tone="neutral">{t("ownerOnly")}</Callout>
          )}
        </div>
      </div>
    </>
  );
}

async function PlanBilling({ user, agency, error }: { user: User; agency: Agency; error?: string }) {
  const [t, format, locale, stores] = await Promise.all([
    getTranslations("billing"),
    getFormatter(),
    getLocale(),
    accessibleStores(user),
  ]);
  const billing = agency.billing;
  const owner = user.platformRole === "agency_admin";
  const upcoming =
    billing?.stripeCustomerId && billing.stripeSubscriptionId && billing.status !== "canceled"
      ? await nextInvoice(billing.stripeCustomerId, billing.stripeSubscriptionId)
      : null;
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium" });
  const status = billing?.status ?? "active";
  const trial = owner && onTrial(agency) && billing ? await trialChoices(agency) : null;

  return (
    <>
      <AppHeader user={user} stores={stores} />
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-7 sm:px-6">
        <PageHeader title={t("pageTitle")} description={agency.name} />

        <div className="mt-6 space-y-5">
          {error === "portal" ? (
            <Callout tone="amber" title={t("portalUnavailableTitle")}>
              {t("unavailableBody")}
            </Callout>
          ) : null}
          {error === "unavailable" ? (
            <Callout tone="amber" title={t("unavailableTitle")}>
              {t("unavailableBody")}
            </Callout>
          ) : null}
          {status === "past_due" ? (
            <Callout tone="rose" title={t("pastDueTitle")}>
              {t("pastDueBody")}
            </Callout>
          ) : status === "canceled" ? (
            <Callout tone="amber" title={t("canceledTitle")}>
              {t("canceledBody")}
            </Callout>
          ) : null}

          <Card>
            <CardContent className="space-y-4">
              <DataList
                rows={[
                  { label: t("planLabel"), value: PLANS[agency.plan].name },
                  ...(billing
                    ? [
                        { label: t("billingPeriod"), value: t(billing.cycle) },
                        {
                          label: t("statusLabel"),
                          value: (
                            <Badge tone={status === "active" ? "green" : status === "trialing" ? "iris" : status === "past_due" ? "rose" : "slate"}>
                              {t(`status.${status}`)}
                            </Badge>
                          ),
                        },
                        {
                          label: t("nextInvoice"),
                          value: trial
                            ? trial.summary
                            : upcoming
                            ? upcoming.date
                              ? t("nextInvoiceOn", {
                                  amount: formatMoney(upcoming.amountDue, upcoming.currency, locale),
                                  date: date(upcoming.date),
                                })
                              : formatMoney(upcoming.amountDue, upcoming.currency, locale)
                            : t("noInvoice"),
                        },
                        ...(onTrial(agency) && billing.trialEndsAt
                          ? [{ label: t("trialEndsOn"), value: date(billing.trialEndsAt) }]
                          : []),
                        ...(billing.cancelAtPeriodEnd && billing.currentPeriodEnd
                          ? [{ label: t("endsOn"), value: date(billing.currentPeriodEnd) }]
                          : []),
                      ]
                    : []),
                ]}
              />
              {!billing ? (
                <p className="text-sm text-muted-foreground">
                  {t("invoiced")}{" "}
                  <Link href="/contact" className="font-medium text-primary hover:underline">
                    {t("contactUs")}
                  </Link>
                </p>
              ) : trial ? (
                <form action={continueToPayment} className="space-y-5 border-t border-border pt-4">
                  <ChoiceGroup legend={t("planLabel")} name="plan" options={trial.plans} />
                  <ChoiceGroup legend={t("billingPeriod")} name="cycle" options={trial.cycles} />
                  {trial.chargedLater ? <p className="text-sm text-muted-foreground">{t("trialNote")}</p> : null}
                  <SubmitButton pendingLabel={t("opening")}>{t("addPayment")}</SubmitButton>
                </form>
              ) : owner && billing.stripeCustomerId ? (
                <form action={openBillingPortal}>
                  <SubmitButton pendingLabel={t("portalOpening")}>{t("manage")}</SubmitButton>
                </form>
              ) : !owner ? (
                <p className="text-sm text-muted-foreground">{t("ownerManages")}</p>
              ) : null}
            </CardContent>
          </Card>
          <Link href="/app" className={buttonVariants({ variant: "outline", size: "sm" })}>
            {t("backToWorkspace")}
          </Link>
        </div>
      </div>
    </>
  );
}

interface Choice {
  value: string;
  label: string;
  detail?: string;
  checked: boolean;
  disabled?: boolean;
}

/**
 * What the owner can pick during the trial, priced in the agency's currency,
 * and what the saved choice costs and when it is first charged. A plan with
 * fewer live stores than the agency runs cannot be picked.
 */
async function trialChoices(agency: Agency) {
  const billing = agency.billing!;
  const [t, format, activeStores] = await Promise.all([
    getTranslations("billing"),
    getFormatter(),
    countActiveStoresForAgency(agency.id),
  ]);
  const money = (amount: number) =>
    format.number(amount, { style: "currency", currency: billing.currency, maximumFractionDigits: 0 });
  const priced = (plan: (typeof PLANS)[keyof typeof PLANS], cycle: BillingCycle) => {
    const amount = money(planPrice(plan, cycle, billing.currency)!.billed);
    return cycle === "yearly" ? t("perYear", { amount }) : t("perMonth", { amount });
  };
  const charge = firstChargeAt(agency);
  const price = priced(PLANS[billing.plan], billing.cycle);
  const plans: Choice[] = await Promise.all(
    SELF_SERVE_PLANS.map(async (key) => {
      const plan = PLANS[key];
      const tooSmall = plan.storeLimit !== null && activeStores > plan.storeLimit;
      const prices = t("planPrices", { monthly: priced(plan, "monthly"), yearly: priced(plan, "yearly") });
      return {
        value: key,
        label: plan.name,
        detail: `${prices} · ${tooSmall ? t("storesInUse", { used: activeStores }) : await planStoresText(plan)}`,
        checked: key === billing.plan,
        disabled: tooSmall,
      };
    }),
  );
  const cycles: Choice[] = CYCLES.map((cycle) => ({
    value: cycle,
    label: t(cycle),
    detail: cycle === "yearly" ? t("yearlySaving", { percent: format.number(YEARLY_DISCOUNT, { style: "percent" }) }) : undefined,
    checked: cycle === billing.cycle,
  }));
  return {
    plans,
    cycles,
    chargedLater: charge !== null,
    summary: charge
      ? t("firstCharge", { price, date: format.dateTime(charge, { dateStyle: "medium" }) })
      : t("chargedNow", { price }),
  };
}

function ChoiceGroup({ legend, name, options }: { legend: string; name: string; options: Choice[] }) {
  return (
    <fieldset>
      <legend className="mb-3 text-sm leading-none font-medium text-foreground select-none">{legend}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((option) => (
          <Label
            key={option.value}
            className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3.5 font-normal hover:border-primary/40 has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              defaultChecked={option.checked}
              disabled={option.disabled}
              className="mt-1 size-4 accent-primary"
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">{option.label}</span>
              {option.detail ? <span className="mt-1 block text-xs text-muted-foreground">{option.detail}</span> : null}
            </span>
          </Label>
        ))}
      </div>
    </fieldset>
  );
}
