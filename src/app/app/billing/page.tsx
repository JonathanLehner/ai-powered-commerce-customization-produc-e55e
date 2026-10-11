import { getFormatter, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { continueToPayment } from "@/app/actions/signup";
import { AppHeader } from "@/components/AppHeader";
import { SubmitButton } from "@/components/forms";
import { Callout, PageHeader } from "@/components/ui";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { TRIAL_DAYS, billingPending } from "@/lib/billing";
import { getAgency } from "@/lib/data";
import { PLANS, planPrice, type BillingCycle } from "@/lib/plans";
import { requireUser } from "@/lib/session";

const CYCLES: BillingCycle[] = ["monthly", "yearly"];

/** Where a new owner finishes paying for the plan they signed up for. */
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; cancelled?: string }>;
}) {
  const { error, cancelled } = await searchParams;
  const user = await requireUser();
  const agency = user.agencyId ? await getAgency(user.agencyId) : null;
  if (!agency?.billing || !billingPending(agency)) redirect("/app");

  const [t, format] = await Promise.all([getTranslations("billing"), getFormatter()]);
  const { plan: planKey, cycle, currency } = agency.billing;
  const plan = PLANS[planKey];
  const money = (amount: number) => format.number(amount, { style: "currency", currency, maximumFractionDigits: 0 });

  return (
    <>
      <AppHeader user={user} stores={[]} />
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-7 sm:px-6">
        <PageHeader title={t("title")} description={agency.name} />

        <div className="mt-6 space-y-5">
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
                  <p className="mt-4 text-sm text-muted-foreground">{t("trial", { days: TRIAL_DAYS })}</p>
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
