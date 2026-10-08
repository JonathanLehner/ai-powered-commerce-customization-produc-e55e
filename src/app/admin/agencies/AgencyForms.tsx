"use client";

import { setAgencyPlan } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PLAN_KEYS } from "@/lib/plans";
import type { Agency } from "@/lib/types";

/**
 * The plan picker is the one control on this page that needs the browser: the
 * shadcn Select is a Radix listbox, so it lives in its own client component
 * while the rest of the page stays a server render.
 */
export function AgencyPlanForm({ agency }: { agency: Agency }) {
  return (
    <form action={setAgencyPlan} className="flex items-center gap-2">
      <input type="hidden" name="agencyId" value={agency.id} />
      <Label htmlFor={`plan-${agency.id}`} className="sr-only">
        Plan for {agency.name}
      </Label>
      <Select name="plan" defaultValue={agency.plan}>
        <SelectTrigger id={`plan-${agency.id}`} size="sm" className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PLAN_KEYS.map((plan) => (
            <SelectItem key={plan} value={plan}>
              {plan}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="submit" variant="outline" size="sm">
        Set plan
      </Button>
    </form>
  );
}
