"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { submitPlanEnquiry } from "@/app/actions/contact";
import { ActionForm, Field } from "@/components/forms";
import { UNDECIDED } from "@/lib/enquiry";
import { PLANS } from "@/lib/plans";
import type { ActionState } from "@/app/actions/stores";
import { newId } from "@/lib/util";

/**
 * The plans the pricing page links from, in the same order and under the same
 * values the action accepts — a button pointing at a plan this list does not
 * carry falls back to "not sure yet" rather than sending something unreadable.
 */
const PLAN_OPTIONS = [
  { value: "starter", label: `${PLANS.starter.name} — $89 a month` },
  { value: "studio", label: `${PLANS.studio.name} — $249 a month` },
  { value: "scale", label: `${PLANS.scale.name} — annual agreement` },
  { value: UNDECIDED, label: "Not sure yet — help me pick" },
];

function subscribeToAddress(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

/** Undecided until the browser can be asked, which is what the HTML is built with. */
function requestedPlan() {
  const requested = new URLSearchParams(window.location.search).get("plan") ?? "";
  return PLAN_OPTIONS.some((option) => option.value === requested) ? requested : UNDECIDED;
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

  return (
    <select
      id="plan"
      name="plan"
      value={chosen ?? fromAddress}
      onChange={(event) => setChosen(event.target.value)}
      className={error ? "input input-error" : "input"}
    >
      {PLAN_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
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
  return (
    <ActionForm
      action={submitPlanEnquiry}
      submitLabel="Send enquiry"
      pendingLabel="Sending…"
      footer={<span className="text-xs text-muted">We reply within one working day.</span>}
    >
      {(state) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <SubmissionKey status={state.status} />
          <Field label="Your name" htmlFor="name" error={state.field === "name"}>
            <input
              id="name"
              name="name"
              autoComplete="name"
              className={state.field === "name" ? "input input-error" : "input"}
            />
          </Field>
          <Field label="Work email" htmlFor="email" error={state.field === "email"}>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              className={state.field === "email" ? "input input-error" : "input"}
            />
          </Field>
          <Field label="Agency or company" htmlFor="company" error={state.field === "company"}>
            <input
              id="company"
              name="company"
              autoComplete="organization"
              className={state.field === "company" ? "input input-error" : "input"}
            />
          </Field>
          <Field label="Which plan" htmlFor="plan" hint="You can change plan later; nothing is charged today.">
            <PlanSelect error={state.field === "plan"} />
          </Field>
          <Field
            label="What are you looking to run?"
            htmlFor="message"
            className="sm:col-span-2"
            hint="How many client stores, which products, and whether you need corporate gifting programmes."
          >
            <textarea id="message" name="message" rows={5} className="input" />
          </Field>
          <label className="flex items-start gap-2.5 text-sm text-inksoft sm:col-span-2">
            <input type="checkbox" name="wantsCall" className="mt-0.5" />
            I would rather have a call than an email
          </label>
        </div>
      )}
    </ActionForm>
  );
}
