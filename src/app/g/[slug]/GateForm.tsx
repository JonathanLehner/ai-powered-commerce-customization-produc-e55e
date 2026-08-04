"use client";

import { unlockGiftCatalogue } from "@/app/actions/gifting";
import { ActionForm } from "@/components/forms";

/** Invite-gated catalogues let somebody in on their work email, nothing else. */
export function GateForm({ slug }: { slug: string }) {
  return (
    <ActionForm
      action={unlockGiftCatalogue}
      submitLabel="Open the catalogue"
      pendingLabel="Checking…"
      hidden={{ slug }}
    >
      {(state) => (
        <div>
          <label htmlFor="email" className="field-label">
            Work email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            aria-invalid={state.field === "email" ? true : undefined}
            aria-describedby="email-hint"
            className={state.field === "email" ? "input input-error" : "input"}
          />
          <p id="email-hint" className="field-hint">
            It has to be one of the addresses your programme owner invited.
          </p>
        </div>
      )}
    </ActionForm>
  );
}
