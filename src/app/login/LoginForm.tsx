"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { signIn, type AuthState } from "@/app/actions/auth";
import { useValueRestore } from "@/components/forms";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary mt-6 w-full" disabled={pending}>
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [state, formAction] = useActionState<AuthState, FormData>(signIn, {});
  const { formRef, capture } = useValueRestore(state.error ? "error" : "idle");

  return (
    <form
      ref={formRef}
      action={(formData: FormData) => {
        capture(formData);
        formAction(formData);
      }}
      noValidate
    >
      <input type="hidden" name="next" value={next} />

      <div>
        <label htmlFor="email" className="field-label">
          Work email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue="alex@northlight.studio"
          aria-invalid={state.field === "email" ? true : undefined}
          aria-describedby={state.error ? "signin-error" : undefined}
          className={state.field === "email" ? "input input-error" : "input"}
        />
      </div>

      <div className="mt-4">
        <label htmlFor="password" className="field-label">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          defaultValue="parcelith"
          aria-invalid={state.field === "password" ? true : undefined}
          aria-describedby={state.error ? "signin-error" : "password-hint"}
          className={state.field === "password" ? "input input-error" : "input"}
        />
        <p id="password-hint" className="field-hint">
          Every demo account uses the password <code className="font-mono">parcelith</code>.
        </p>
      </div>

      {state.error ? (
        <p
          id="signin-error"
          role="alert"
          className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
        >
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
