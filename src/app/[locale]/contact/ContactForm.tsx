"use client";

import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { submitPlanEnquiry } from "@/app/actions/contact";
import { ActionForm, Field } from "@/components/forms";
import { UNDECIDED } from "@/lib/enquiry";
import { PLAN_KEYS, PLANS, planPrice, type Plan, type PlanKey } from "@/lib/plans";
import type { ActionState } from "@/app/actions/stores";
import { newId } from "@/lib/util";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/**
 * The plans the pricing page links from, in the same order and under the same
 * values the action accepts — a button pointing at a plan this list does not
 * carry falls back to "not sure yet" rather than sending something unreadable.
 */
const PLAN_VALUES = [...PLAN_KEYS, UNDECIDED];

function usePlanOptions() {
  const t = useTranslations("contact.form");
  const format = useFormatter();
  const label = (plan: Plan) => {
    const price = planPrice(plan, "monthly");
    return price
      ? t("planOption", {
          plan: plan.name,
          price: format.number(price.perMonth, { style: "currency", currency: "USD", maximumFractionDigits: 0 }),
        })
      : t("planCustom", { plan: plan.name });
  };
  return PLAN_VALUES.map((value) => ({
    value,
    label: value === UNDECIDED ? t("notSure") : label(PLANS[value as PlanKey]),
  }));
}

function subscribeToAddress(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

/** Undecided until the browser can be asked, which is what the HTML is built with. */
function requestedPlan() {
  const requested = new URLSearchParams(window.location.search).get("plan") ?? "";
  return PLAN_VALUES.includes(requested) ? requested : UNDECIDED;
}

/**
 * The plan the visitor pressed, carried in `?plan=`.
 *
 * The page is prerendered, so the query is not known when the HTML is built:
 * the control starts on "not sure yet" and switches to whichever plan the
 * button named once the browser can be asked. Reading the address here rather
 * than through the router keeps the page out of request-time rendering, and the
 * visitor can pick a different plan afterwards.
 */
function PlanSelect({ error }: { error: boolean }) {
  const fromAddress = useSyncExternalStore(subscribeToAddress, requestedPlan, () => UNDECIDED);
  const [chosen, setChosen] = useState<string | null>(null);
  const options = usePlanOptions();

  return (
    <Select name="plan" value={chosen ?? fromAddress} onValueChange={setChosen}>
      <SelectTrigger id="plan" className="mt-1.5 w-full" aria-invalid={error ? true : undefined}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * One key per filled-in form. A double click, a slow reply or a retried
 * submission carries the same key, so the enquiry is recorded once; an accepted
 * enquiry rotates it, so the next thing this visitor sends is a new enquiry.
 *
 * The key is minted after mount rather than during render: the page is
 * prerendered, and a value invented at build time would be the same for every
 * visitor.
 */
function SubmissionKey({ status }: { status: ActionState["status"] }) {
  const [key, setKey] = useState("");
  const previous = useRef<ActionState["status"]>("idle");

  useEffect(() => {
    if (!key || (status === "success" && previous.current !== "success")) setKey(newId("frm"));
    previous.current = status;
  }, [status, key]);

  return <input type="hidden" name="submissionKey" value={key} />;
}

export function ContactForm() {
  const t = useTranslations("contact.form");
  const locale = useLocale();
  return (
    <ActionForm
      action={submitPlanEnquiry}
      hidden={{ locale }}
      submitLabel={t("submit")}
      pendingLabel={t("sending")}
      footer={<span className="text-xs text-muted-foreground">{t("replyTime")}</span>}
    >
      {(state) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <SubmissionKey status={state.status} />
          <Field label={t("name")} htmlFor="name" error={state.field === "name"}>
            <Input
              id="name"
              name="name"
              autoComplete="name"
              className="mt-1.5"
            />
          </Field>
          <Field label={t("email")} htmlFor="email" error={state.field === "email"}>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              className="mt-1.5"
            />
          </Field>
          <Field label={t("company")} htmlFor="company" error={state.field === "company"}>
            <Input
              id="company"
              name="company"
              autoComplete="organization"
              className="mt-1.5"
            />
          </Field>
          <Field label={t("plan")} htmlFor="plan">
            <PlanSelect error={state.field === "plan"} />
          </Field>
          <Field
            label={t("message")}
            htmlFor="message"
            className="sm:col-span-2"
            hint={t("messageHint")}
          >
            <Textarea id="message" name="message" rows={5} className="mt-1.5" />
          </Field>
          <Label className="flex cursor-pointer items-center gap-2.5 text-sm font-normal text-muted-foreground sm:col-span-2">
            <Checkbox name="wantsCall" />
            {t("wantsCall")}
          </Label>
        </div>
      )}
    </ActionForm>
  );
}
