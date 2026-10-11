"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "@/i18n/navigation";
import { PLAN_CURRENCIES, type BillingCycle, type PlanCurrency, type PlanPrice } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { usePlanCurrency } from "../currency";
import { CheckList } from "../kit";

export interface PlanCard {
  name: string;
  summary: string;
  features: string[];
  cta: string;
  /** Plans with a price get the billing period and currency added, so sign-up starts on what was shown. */
  href: string;
  highlighted: boolean;
  /** null for a plan priced by sales. */
  prices: Record<PlanCurrency, Record<BillingCycle, PlanPrice>> | null;
}

/** The plan cards and the Monthly/Yearly and currency switches that reprice them. */
export function PlanCards({ plans, yearlySaving }: { plans: PlanCard[]; yearlySaving: string }) {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [currency, setCurrency] = usePlanCurrency();
  const t = useTranslations("pricing");
  const format = useFormatter();
  const money = (amount: number) =>
    format.number(amount, { style: "currency", currency, maximumFractionDigits: 0 });

  return (
    <>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Tabs
          value={cycle}
          onValueChange={(value) => setCycle(value as BillingCycle)}
          className="w-fit items-center"
        >
          <TabsList aria-label={t("billingPeriod")}>
            <TabsTrigger value="monthly" className="px-4">
              {t("monthly")}
            </TabsTrigger>
            <TabsTrigger value="yearly" className="gap-2 px-4">
              {t("yearly")}
              <span className="text-xs font-medium text-primary">{t("save", { percent: yearlySaving })}</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs
          value={currency}
          onValueChange={(value) => setCurrency(value as PlanCurrency)}
          className="w-fit items-center"
        >
          <TabsList aria-label={t("currency")}>
            {PLAN_CURRENCIES.map((code) => (
              <TabsTrigger key={code} value={code} className="px-3">
                {code}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="mt-10 grid items-start gap-4 lg:grid-cols-3">
        {plans.map((plan) => {
          const price = plan.prices?.[currency][cycle];
          return (
            <Card
              key={plan.name}
              className={cn(
                "h-full",
                plan.highlighted && "relative mt-3 overflow-visible bg-primary/[0.03] ring-2 ring-primary lg:mt-0",
              )}
            >
              {plan.highlighted ? (
                <span className="absolute -top-3 left-6">
                  <Badge tone="brand" className="border-transparent bg-primary text-primary-foreground">
                    {t("mostPopular")}
                  </Badge>
                </span>
              ) : null}
              <CardHeader>
                <h2 className="font-heading text-lg font-semibold text-foreground">{plan.name}</h2>
                <p className="text-sm text-muted-foreground">{plan.summary}</p>
              </CardHeader>
              <CardContent>
                <p className="flex items-baseline gap-1">
                  <span className="font-heading text-3xl font-semibold tracking-tight text-foreground">
                    {price ? money(price.perMonth) : t("custom")}
                  </span>
                  {price ? <span className="text-sm text-muted-foreground">{t("perMonth")}</span> : null}
                </p>
                <p className="mt-1 h-5 text-sm text-muted-foreground">
                  {price
                    ? cycle === "yearly"
                      ? t("billedYearly", { amount: money(price.billed) })
                      : t("billedMonthly")
                    : t("annualContract")}
                </p>
                <CheckList items={plan.features} className="mt-6" />
              </CardContent>
              <CardFooter className="border-0 bg-transparent pt-0">
                <Button asChild size="lg" variant={plan.highlighted ? "default" : "outline"} className="w-full">
                  <Link href={plan.prices ? `${plan.href}&cycle=${cycle}&currency=${currency}` : plan.href}>{plan.cta}</Link>
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
      <p className="mt-6 text-center text-sm text-muted-foreground">{t("taxNote", { currency })}</p>
    </>
  );
}
