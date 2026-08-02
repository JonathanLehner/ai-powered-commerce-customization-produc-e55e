"use client";

import { inviteTeamMember } from "@/app/actions/team";
import { ActionForm } from "@/components/forms";
import { STORE_ROLE_DESCRIPTIONS, STORE_ROLE_LABELS, type StoreRole } from "@/lib/types";

const ROLES: StoreRole[] = ["store_admin", "catalog_manager", "order_manager", "viewer"];

export function InviteForm({ storeId }: { storeId: string }) {
  return (
    <ActionForm
      action={inviteTeamMember}
      submitLabel="Send invitation"
      pendingLabel="Sending…"
      hidden={{ storeId }}
      className="card p-5"
    >
      {(state) => (
        <>
          <h2 className="text-base font-semibold text-ink">Invite someone to this store</h2>
          <p className="mt-1 text-sm text-muted">
            Access is scoped to this store only. The same person can hold a different role in another client
            store.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="invite-email" className="field-label">
                Email address
              </label>
              <input
                id="invite-email"
                name="email"
                type="email"
                required
                placeholder="name@company.com"
                aria-invalid={state.field === "email" ? true : undefined}
                className={state.field === "email" ? "input input-error" : "input"}
              />
            </div>
            <div>
              <label htmlFor="invite-name" className="field-label">
                Name
              </label>
              <input
                id="invite-name"
                name="name"
                required
                minLength={2}
                placeholder="Jordan Reyes"
                aria-invalid={state.field === "name" ? true : undefined}
                className={state.field === "name" ? "input input-error" : "input"}
              />
            </div>
          </div>

          <fieldset className="mt-5">
            <legend className="field-label">Role</legend>
            <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
              {ROLES.map((role, index) => (
                <label
                  key={role}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3.5 hover:border-brand-300 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50/50"
                >
                  <input
                    type="radio"
                    name="role"
                    value={role}
                    defaultChecked={index === 1}
                    className="mt-1 h-4 w-4 accent-brand-600"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">{STORE_ROLE_LABELS[role]}</span>
                    <span className="mt-0.5 block text-xs text-muted">{STORE_ROLE_DESCRIPTIONS[role]}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </>
      )}
    </ActionForm>
  );
}
