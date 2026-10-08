"use client";

import { unlockGiftCatalogue } from "@/app/actions/gifting";
import { ActionForm } from "@/components/forms";
import type { StorefrontCopy } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Invite-gated catalogues let somebody in on their work email, nothing else. */
export function GateForm({ slug, t }: { slug: string; t: StorefrontCopy["gift"] }) {
  return (
    <ActionForm
      action={unlockGiftCatalogue}
      submitLabel={t.gateSubmit}
      pendingLabel={t.gatePending}
      hidden={{ slug }}
    >
      {(state) => (
        <div>
          <Label htmlFor="email">
            {t.gateEmail}
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            aria-invalid={state.field === "email" ? true : undefined}
            aria-describedby="email-hint"
            className="mt-1.5"
          />
          <p id="email-hint" className="mt-1.5 text-xs text-muted-foreground">
            {t.gateEmailHint}
          </p>
        </div>
      )}
    </ActionForm>
  );
}
