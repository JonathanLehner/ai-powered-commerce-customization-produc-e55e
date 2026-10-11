"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDollars, type BillingCycle, type PlanPrice } from "@/lib/plans";
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

  return (
    <>
      <Tabs
        value={cycle}
        onValueChange={(value) => setCycle(value as BillingCycle)}
        className="mx-auto w-fit items-center"
      >
        <TabsList aria-label="Billing period">
          <TabsTrigger value="monthly" className="px-4">
            Monthly
          </TabsTrigger>
          <TabsTrigger value="yearly" className="gap-2 px-4">
            Yearly
            <span className="text-xs font-medium text-primary">Save {yearlySaving}</span>
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
                    Most popular
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
                    {price ? formatDollars(price.perMonth) : "Custom"}
                  </span>
                  {price ? <span className="text-sm text-muted-foreground">/month</span> : null}
                </p>
                <p className="mt-1 h-5 text-sm text-muted-foreground">
                  {price
                    ? cycle === "yearly"
                      ? `Billed ${formatDollars(price.billed)} yearly`
                      : "Billed monthly"
                    : "Annual contract"}
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
