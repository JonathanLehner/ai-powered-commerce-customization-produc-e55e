"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "@/i18n/navigation";
import type { BillingCycle, PlanPrice } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { CheckList } from "../kit";

export interface PlanCard {
  name: string;
  summary: string;
  features: string[];
  cta: string;
  href: string;
  highlighted: boolean;
  /** null for a plan priced by sales. */
  prices: Record<BillingCycle, PlanPrice> | null;
}

/** The plan cards and the Monthly/Yearly switch that reprices them. */
export function PlanCards({ plans, yearlySaving }: { plans: PlanCard[]; yearlySaving: string }) {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const t = useTranslations("pricing");
  const format = useFormatter();
  const dollars = (amount: number) =>
    format.number(amount, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  return (
    <>
      <Tabs
        value={cycle}
        onValueChange={(value) => setCycle(value as BillingCycle)}
        className="mx-auto w-fit items-center"
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

      <div className="mt-10 grid items-start gap-4 lg:grid-cols-3">
        {plans.map((plan) => {
          const price = plan.prices?.[cycle];
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
                    {price ? dollars(price.perMonth) : t("custom")}
                  </span>
                  {price ? <span className="text-sm text-muted-foreground">{t("perMonth")}</span> : null}
                </p>
                <p className="mt-1 h-5 text-sm text-muted-foreground">
                  {price
                    ? cycle === "yearly"
                      ? t("billedYearly", { amount: dollars(price.billed) })
                      : t("billedMonthly")
                    : t("annualContract")}
                </p>
                <CheckList items={plan.features} className="mt-6" />
              </CardContent>
              <CardFooter className="border-0 bg-transparent pt-0">
                <Button asChild size="lg" variant={plan.highlighted ? "default" : "outline"} className="w-full">
                  <Link href={plan.href}>{plan.cta}</Link>
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </>
  );
}
