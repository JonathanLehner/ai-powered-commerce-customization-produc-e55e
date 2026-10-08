"use client";

import { inviteTeamMember } from "@/app/actions/team";
import { ActionForm } from "@/components/forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { STORE_ROLE_DESCRIPTIONS, STORE_ROLE_LABELS, type StoreRole } from "@/lib/types";

const ROLES: StoreRole[] = ["store_admin", "catalog_manager", "order_manager", "viewer"];

export function InviteForm({ storeId }: { storeId: string }) {
  return (
    <Card asChild>
      <ActionForm
        action={inviteTeamMember}
        submitLabel="Send invitation"
        pendingLabel="Sending…"
        hidden={{ storeId }}
        actionsClassName="px-(--card-spacing)"
      >
        {(state) => (
          <>
            <CardHeader>
              <CardTitle asChild>
                <h2>Invite someone to this store</h2>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Access is scoped to this store only. The same person can hold a different role in another
                client store.
              </p>
            </CardHeader>

            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid content-start gap-1.5">
                  <Label htmlFor="invite-email">Email address</Label>
                  <Input
                    id="invite-email"
                    name="email"
                    type="email"
                    required
                    placeholder="name@company.com"
                    aria-invalid={state.field === "email" ? true : undefined}
                  />
                </div>
                <div className="grid content-start gap-1.5">
                  <Label htmlFor="invite-name">Name</Label>
                  <Input
                    id="invite-name"
                    name="name"
                    required
                    minLength={2}
                    placeholder="Jordan Reyes"
                    aria-invalid={state.field === "name" ? true : undefined}
                  />
                </div>
              </div>

              <fieldset className="mt-5">
                <legend className="text-sm leading-none font-medium text-foreground select-none">Role</legend>
                <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                  {ROLES.map((role, index) => (
                    <Label
                      key={role}
                      className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3.5 font-normal hover:border-primary/40 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                    >
                      <input
                        type="radio"
                        name="role"
                        value={role}
                        defaultChecked={index === 1}
                        className="mt-1 size-4 accent-primary"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-foreground">
                          {STORE_ROLE_LABELS[role]}
                        </span>
                        <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                          {STORE_ROLE_DESCRIPTIONS[role]}
                        </span>
                      </span>
                    </Label>
                  ))}
                </div>
              </fieldset>
            </CardContent>
          </>
        )}
      </ActionForm>
    </Card>
  );
}
