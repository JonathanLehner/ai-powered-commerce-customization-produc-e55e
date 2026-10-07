"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import type { ActionState } from "@/app/actions/stores";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  captureValues,
  planRestore,
  type ControlSnapshot,
  type SubmittedValues,
} from "@/lib/form-restore";
import { newId } from "@/lib/util";
import { cn } from "@/lib/utils";

/**
 * Every caller styles its buttons the way the rest of the app does — with the
 * `btn-primary` / `btn-secondary` / `btn-ghost` / `btn-danger` / `btn-sm`
 * classes. Those names are translated here into the shadcn Button's own variant
 * and size, so the control is a real Button while no caller has to change.
 */
function asButton(className: string): {
  variant: "default" | "outline" | "secondary" | "ghost" | "destructive";
  size: "default" | "sm";
  className: string;
} {
  const has = (name: string) => className.split(/\s+/).includes(name);
  return {
    variant: has("btn-danger")
      ? "destructive"
      : has("btn-secondary")
        ? "outline"
        : has("btn-ghost")
          ? "ghost"
          : has("btn-iris")
            ? "secondary"
            : "default",
    size: has("btn-sm") ? "sm" : "default",
    // Whatever the caller added on top — `w-full`, a margin, a text colour.
    className: className
      .split(/\s+/)
      .filter((name) => name !== "" && !/^btn(-[a-z]+)?$/.test(name))
      .join(" "),
  };
}

/**
 * One key per filled-in form, posted as `submissionKey`. A double click, a slow
 * reply or a retried submission carries the same key, so the server records it
 * once; a success rotates it, so the next entry is a new record.
 */
export function SubmissionKey({ status, prefix }: { status: ActionState["status"]; prefix: string }) {
  const [key, setKey] = useState("");
  const previous = useRef<ActionState["status"]>("idle");

  useEffect(() => {
    if (!key || (status === "success" && previous.current !== "success")) setKey(newId(prefix));
    previous.current = status;
  }, [status, key, prefix]);

  return <input type="hidden" name="submissionKey" value={key} />;
}

/** What the action returned, and which attempt returned it. */
export interface Submission<S extends ActionState = ActionState> {
  state: S;
  /**
   * Counts settled submissions. Two rejections in a row can carry the very same
   * message and field, so the attempt number is what tells an effect that a new
   * result has landed.
   */
  attempt: number;
}

/**
 * `useActionState` with that attempt counter alongside the state, so a repeat of
 * the previous result is still recognisably a new result.
 */
export function useSubmission<S extends ActionState>(
  action: (state: S, formData: FormData) => Promise<S>,
  initial: S,
) {
  return useActionState<Submission<S>, FormData>(
    async (previous, formData) => ({
      state: await action(previous.state, formData),
      attempt: previous.attempt + 1,
    }),
    { state: initial, attempt: 0 },
  );
}

function snapshot(element: Element): ControlSnapshot {
  if (element instanceof HTMLInputElement) {
    // A file input cannot be written to, and hidden fields are rendered from
    // props React never lost.
    if (element.type === "file" || element.type === "hidden") {
      return { name: element.name, kind: "ignored", submits: "" };
    }
    if (element.type === "checkbox" || element.type === "radio") {
      return { name: element.name, kind: "toggle", submits: element.value };
    }
    return { name: element.name, kind: "value", submits: "" };
  }
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    return { name: element.name, kind: "value", submits: "" };
  }
  return { name: "", kind: "ignored", submits: "" };
}

/**
 * React resets uncontrolled inputs once a form action settles. That is right
 * after a success, but on a validation error it would throw away everything the
 * person typed, so the submitted values are captured and put back.
 *
 * This runs on every rejected attempt, not only the first: the status stays on
 * "error" from one failure to the next, so it is the attempt number that says a
 * fresh answer arrived and the form needs filling in again.
 */
export function useValueRestore(status: ActionState["status"], attempt: number) {
  const formRef = useRef<HTMLFormElement>(null);
  const submitted = useRef<SubmittedValues | null>(null);

  function capture(formData: FormData) {
    submitted.current = captureValues(formData);
  }

  useEffect(() => {
    const entries = submitted.current;
    if (status !== "error") {
      // A success is meant to clear: the form has been accepted.
      submitted.current = null;
      return;
    }
    if (!entries || !formRef.current) return;

    const elements = Array.from(formRef.current.elements);
    const plan = planRestore(elements.map(snapshot), entries);
    elements.forEach((element, index) => {
      const restore = plan[index];
      if (!restore) return;
      if ("checked" in restore) {
        (element as HTMLInputElement).checked = restore.checked;
      } else {
        // Written over whatever the reset left behind — blank on a checkout,
        // the saved value on an editor — since both would lose the edit.
        (element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value = restore.value;
      }
    });
  }, [status, attempt]);

  return { formRef, capture };
}

export function SubmitButton({
  children,
  pendingLabel,
  className = "btn-primary",
  disabled,
  name,
  value,
}: {
  children: ReactNode;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" {...asButton(className)} disabled={pending || disabled} name={name} value={value}>
      {pending ? (pendingLabel ?? "Saving…") : children}
    </Button>
  );
}

export function FormStatus({ state }: { state: ActionState }) {
  if (state.status === "idle" || !state.message) return null;
  const error = state.status === "error";
  return (
    <p
      role="status"
      aria-live="polite"
      className={cn(
        "mt-4 rounded-lg border px-3 py-2 text-sm",
        error
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : "border-emerald-200 bg-emerald-50 text-emerald-800",
      )}
    >
      {error ? state.message : `✓ ${state.message}`}
    </p>
  );
}

/**
 * Wraps a server action in useActionState so every form in the workspace gets
 * the same inline validation, success confirmation and locked submit button.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel,
  submitClassName = "btn-primary",
  className,
  footer,
  hidden,
  submitDisabled,
  beforeSubmit,
  toastOnSuccess,
  id,
  submit,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode | ((state: ActionState) => ReactNode);
  submitLabel: string;
  pendingLabel?: string;
  submitClassName?: string;
  className?: string;
  footer?: ReactNode;
  hidden?: Record<string, string>;
  /** Locks the submit button while the form is not ready, e.g. an upload in flight. */
  submitDisabled?: boolean;
  /** Last chance to add fields the browser has to produce, such as a rendered preview. */
  beforeSubmit?: (formData: FormData) => Promise<void>;
  /**
   * Raises the confirmation as a toast as well as inline. Used where the form
   * sits far down a long page — an order's fulfilment panels — so the answer is
   * not left off screen.
   */
  toastOnSuccess?: boolean;
  /** So a submit button rendered outside the form can still post it. */
  id?: string;
  /**
   * Replaces the default submit button — used where the action is confirmed in
   * a dialog first, whose own button carries `form={id}`.
   */
  submit?: ReactNode;
}) {
  const [{ state, attempt }, formAction] = useSubmission<ActionState>(action, { status: "idle" });
  const { formRef, capture } = useValueRestore(state.status, attempt);
  const toasted = useRef(0);

  useEffect(() => {
    if (!toastOnSuccess || attempt === toasted.current) return;
    toasted.current = attempt;
    if (state.status === "success" && state.message) toast.success(state.message);
  }, [toastOnSuccess, state.status, state.message, attempt]);

  return (
    <form
      ref={formRef}
      action={async (formData: FormData) => {
        capture(formData);
        if (beforeSubmit) {
          try {
            await beforeSubmit(formData);
          } catch {
            // A preview that cannot be drawn must not block the submission —
            // the action falls back to the stored imagery.
          }
        }
        formAction(formData);
      }}
      id={id}
      className={className}
      noValidate
    >
      {hidden
        ? Object.entries(hidden).map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))
        : null}
      {typeof children === "function" ? children(state) : children}
      <FormStatus state={state} />
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {submit ?? (
          <SubmitButton className={submitClassName} pendingLabel={pendingLabel} disabled={submitDisabled}>
            {submitLabel}
          </SubmitButton>
        )}
        {footer}
      </div>
    </form>
  );
}

/** Destructive actions ask once before they run, and lock while running. */
export function ConfirmSubmit({
  children,
  confirmLabel,
  className = "btn-danger",
  question = "Are you sure?",
  pendingLabel = "Working…",
  cancelLabel = "Cancel",
}: {
  children: ReactNode;
  confirmLabel: string;
  className?: string;
  question?: string;
  /** Overridden where the control is shopper-facing and has to be translated. */
  pendingLabel?: string;
  cancelLabel?: string;
}) {
  const [armed, setArmed] = useState(false);
  const { pending } = useFormStatus();

  if (!armed) {
    return (
      <Button type="button" {...asButton(className)} onClick={() => setArmed(true)} disabled={pending}>
        {children}
      </Button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="text-sm text-inksoft">{question}</span>
      <Button type="submit" {...asButton(className)} disabled={pending}>
        {pending ? pendingLabel : confirmLabel}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setArmed(false)} disabled={pending}>
        {cancelLabel}
      </Button>
    </span>
  );
}

/**
 * A link somebody has to send on, with a one-click copy.
 *
 * The address stays visible and selectable, because the clipboard is not
 * available on an insecure origin or when the browser refuses permission — in
 * that case the button says so instead of pretending it worked, and the text is
 * selected ready to be copied by hand.
 */
export function CopyField({ value, label = "Copy link" }: { value: string; label?: string }) {
  const [result, setResult] = useState<"idle" | "copied" | "failed">("idle");
  const textRef = useRef<HTMLParagraphElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setResult("copied");
    } catch {
      const node = textRef.current;
      if (node) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      setResult("failed");
    }
  }

  return (
    <div>
      <p
        ref={textRef}
        className="rounded-lg border border-border bg-muted px-3 py-2 font-mono text-xs break-all text-inksoft"
      >
        {value}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {result === "copied" ? <CheckIcon /> : <CopyIcon />}
          {label}
        </Button>
        <span role="status" aria-live="polite" className="text-xs text-muted-foreground">
          {result === "copied"
            ? "Copied to the clipboard."
            : result === "failed"
              ? "This browser would not let the page copy it — the address is selected, copy it by hand."
              : ""}
        </span>
      </div>
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? (
        <p id={`${htmlFor}-hint`} className={cn("field-hint", error && "text-destructive")}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
