"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/actions/stores";
import { classNames } from "@/lib/util";

/**
 * React resets uncontrolled inputs once a form action settles. That is right
 * after a success, but on a validation error it would throw away everything the
 * person typed, so the submitted values are captured and put back.
 */
export function useValueRestore(status: ActionState["status"]) {
  const formRef = useRef<HTMLFormElement>(null);
  const submitted = useRef<[string, string][] | null>(null);

  function capture(formData: FormData) {
    const entries: [string, string][] = [];
    formData.forEach((value, key) => {
      if (typeof value === "string") entries.push([key, value]);
    });
    submitted.current = entries;
  }

  useEffect(() => {
    if (status !== "error" || !submitted.current || !formRef.current) return;
    const entries = submitted.current;
    const used = new Set<string>();
    for (const element of Array.from(formRef.current.elements)) {
      if (element instanceof HTMLInputElement) {
        if (element.type === "file" || element.type === "hidden") continue;
        if (element.type === "checkbox" || element.type === "radio") {
          element.checked = entries.some(([k, v]) => k === element.name && v === element.value);
          continue;
        }
        const match = entries.find(([k], i) => k === element.name && !used.has(`${k}:${i}`));
        if (match && !element.value) element.value = match[1];
      } else if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
        const match = entries.find(([k]) => k === element.name);
        if (match && !element.value) element.value = match[1];
      }
    }
  }, [status]);

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
    <button type="submit" className={className} disabled={pending || disabled} name={name} value={value}>
      {pending ? (pendingLabel ?? "Saving…") : children}
    </button>
  );
}

export function FormStatus({ state }: { state: ActionState }) {
  if (state.status === "idle" || !state.message) return null;
  const error = state.status === "error";
  return (
    <p
      role="status"
      aria-live="polite"
      className={classNames(
        "mt-4 rounded-lg border px-3 py-2 text-sm",
        error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-800",
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
  beforeSubmit,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode | ((state: ActionState) => ReactNode);
  submitLabel: string;
  pendingLabel?: string;
  submitClassName?: string;
  className?: string;
  footer?: ReactNode;
  hidden?: Record<string, string>;
  /** Last chance to add fields the browser has to produce, such as a rendered preview. */
  beforeSubmit?: (formData: FormData) => Promise<void>;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, { status: "idle" });
  const { formRef, capture } = useValueRestore(state.status);

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
        <SubmitButton className={submitClassName} pendingLabel={pendingLabel}>
          {submitLabel}
        </SubmitButton>
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
}: {
  children: ReactNode;
  confirmLabel: string;
  className?: string;
  question?: string;
}) {
  const [armed, setArmed] = useState(false);
  const { pending } = useFormStatus();

  if (!armed) {
    return (
      <button type="button" className={className} onClick={() => setArmed(true)} disabled={pending}>
        {children}
      </button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="text-sm text-inksoft">{question}</span>
      <button type="submit" className={className} disabled={pending}>
        {pending ? "Working…" : confirmLabel}
      </button>
      <button type="button" className="btn-ghost btn-sm" onClick={() => setArmed(false)} disabled={pending}>
        Cancel
      </button>
    </span>
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
      <label htmlFor={htmlFor} className="field-label">
        {label}
      </label>
      {children}
      {hint ? (
        <p id={`${htmlFor}-hint`} className={classNames("field-hint", error && "text-rose-600")}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
