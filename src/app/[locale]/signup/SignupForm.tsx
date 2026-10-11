"use client";

import { useFormatter, useLocale, useTranslations } from "next-intl";
import NextLink from "next/link";
import { useState, useSyncExternalStore } from "react";
import { createAccount } from "@/app/actions/signup";
import { ActionForm, Field, SubmissionKey } from "@/components/forms";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "@/i18n/navigation";
import { PLANS, isPlanCurrency, planPrice, type BillingCycle, type PlanCurrency } from "@/lib/plans";
import { MIN_PASSWORD_LENGTH, SELF_SERVE_PLANS, TRIAL_DAYS, isBillingCycle, isSelfServePlan, type SelfServePlan } from "@/lib/signup";
import { usePlanCurrency } from "../currency";

interface Requested {
  plan: SelfServePlan;
  cycle: BillingCycle;
  currency: PlanCurrency | null;
}

const DEFAULT_REQUEST: Requested = { plan: "studio", cycle: "monthly", currency: null };

function subscribeToAddress(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

let lastSearch = "";
let lastRequest = DEFAULT_REQUEST;

/** `?plan=studio&cycle=yearly&currency=EUR`, as the pricing page's buttons send it. */
function requestedFromAddress(): Requested {
  const search = window.location.search;
  if (search === lastSearch) return lastRequest;
  const query = new URLSearchParams(search);
  const plan = query.get("plan");
  const cycle = query.get("cycle");
  const currency = query.get("currency");
  lastSearch = search;
  lastRequest = {
    plan: isSelfServePlan(plan) ? plan : DEFAULT_REQUEST.plan,
    cycle: isBillingCycle(cycle) ? cycle : DEFAULT_REQUEST.cycle,
    currency: isPlanCurrency(currency) ? currency : null,
  };
  return lastRequest;
}

/**
 * The sign-up form and the plan it starts.
 *
 * The page is prerendered, so the plan, billing period and currency picked on
 * the pricing page are read from the address once the browser can be asked;
 * the visitor can still change the plan and period here.
 */
export function SignupForm() {
  const t = useTranslations("signup");
  const locale = useLocale();
  const format = useFormatter();
  const requested = useSyncExternalStore(subscribeToAddress, requestedFromAddress, () => DEFAULT_REQUEST);
  const [storedCurrency] = usePlanCurrency();
  const [chosenPlan, setPlan] = useState<SelfServePlan | null>(null);
  const [chosenCycle, setCycle] = useState<BillingCycle | null>(null);

  const planKey = chosenPlan ?? requested.plan;
  const cycle = chosenCycle ?? requested.cycle;
  const currency = requested.currency ?? storedCurrency;
  const plan = PLANS[planKey];
  const price = planPrice(plan, cycle, currency)!;
  const money = (amount: number) =>
    format.number(amount, { style: "currency", currency, maximumFractionDigits: 0 });

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-8">
      <Card>
        <CardContent>
          <ActionForm
            action={createAccount}
            hidden={{ locale, plan: planKey, cycle, currency }}
            submitLabel={t("submit")}
            pendingLabel={t("pending")}
            submitSize="lg"
            footer={
              <span className="text-sm text-muted-foreground">
                {t("haveAccount")}{" "}
                <NextLink href="/login" className="font-medium text-foreground hover:underline">
                  {t("signIn")}
                </NextLink>
              </span>
            }
          >
            {(state) => (
              <div className="grid gap-4 sm:grid-cols-2">
                <SubmissionKey status={state.status} prefix="sgn" />
                <Field label={t("name")} htmlFor="name" error={state.field === "name"}>
                  <Input
                    id="name"
                    name="name"
                    autoComplete="name"
                    className="mt-1.5"
                    aria-invalid={state.field === "name" ? true : undefined}
                  />
                </Field>
                <Field label={t("email")} htmlFor="email" error={state.field === "email"}>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="name@agency.com"
                    className="mt-1.5"
                    aria-invalid={state.field === "email" ? true : undefined}
                  />
                </Field>
                <Field label={t("agencyName")} htmlFor="agencyName" error={state.field === "agencyName"} className="sm:col-span-2">
                  <Input
                    id="agencyName"
                    name="agencyName"
                    autoComplete="organization"
                    className="mt-1.5"
                    aria-invalid={state.field === "agencyName" ? true : undefined}
                  />
                </Field>
                <Field
                  label={t("password")}
                  htmlFor="password"
                  error={state.field === "password"}
                  hint={t("passwordHint", { count: MIN_PASSWORD_LENGTH })}
                  className="sm:col-span-2"
                >
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    className="mt-1.5"
                    aria-describedby="password-hint"
                    aria-invalid={state.field === "password" ? true : undefined}
                  />
                </Field>
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  {t.rich("terms", {
                    terms: (chunks) => (
                      <Link href="/legal/terms" className="underline hover:text-foreground">
                        {chunks}
                      </Link>
                    ),
                    privacy: (chunks) => (
                      <Link href="/legal/privacy" className="underline hover:text-foreground">
                        {chunks}
                      </Link>
                    ),
                  })}
                </p>
              </div>
            )}
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h2 className="text-sm font-semibold text-foreground">{t("summaryTitle")}</h2>
          <Tabs
            value={planKey}
            onValueChange={(value) => isSelfServePlan(value) && setPlan(value)}
            className="mt-4 w-full"
          >
            <TabsList aria-label={t("plan")} className="w-full">
              {SELF_SERVE_PLANS.map((key) => (
                <TabsTrigger key={key} value={key} className="flex-1">
                  {PLANS[key].name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Tabs
            value={cycle}
            onValueChange={(value) => isBillingCycle(value) && setCycle(value)}
            className="mt-3 w-full"
          >
            <TabsList aria-label={t("billingPeriod")} className="w-full">
              <TabsTrigger value="monthly" className="flex-1">
                {t("monthly")}
              </TabsTrigger>
              <TabsTrigger value="yearly" className="flex-1">
                {t("yearly")}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <p className="mt-5 flex items-baseline gap-1">
            <span className="font-heading text-3xl font-semibold tracking-tight text-foreground">
              {money(price.perMonth)}
            </span>
            <span className="text-sm text-muted-foreground">{t("perMonth")}</span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {cycle === "yearly" ? t("billedYearly", { amount: money(price.billed) }) : t("billedMonthly")}
          </p>
          <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">
            {t("trial", { days: TRIAL_DAYS })}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {t.rich("scale", {
              link: (chunks) => (
                <Link href="/contact?plan=scale" className="font-medium text-foreground underline">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
