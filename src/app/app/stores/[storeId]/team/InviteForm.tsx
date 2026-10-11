"use client";

import { useLocale, useTranslations } from "next-intl";
import { inviteTeamMember } from "@/app/actions/team";
import { ActionForm } from "@/components/forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LOCALES, LOCALE_NAMES } from "@/i18n/locales";
import type { StoreRole } from "@/lib/types";

const ROLES: StoreRole[] = ["store_admin", "catalog_manager", "order_manager", "viewer"];

export function InviteForm({ storeId }: { storeId: string }) {
  const t = useTranslations("team");
  const roles = useTranslations("roles");
  const locale = useLocale();
  return (
    <Card asChild>
      <ActionForm
        action={inviteTeamMember}
        submitLabel={t("sendInvitation")}
        pendingLabel={t("sending")}
        hidden={{ storeId }}
        actionsClassName="px-(--card-spacing)"
      >
        {(state) => (
          <>
            <CardHeader>
              <CardTitle asChild>
                <h2>{t("inviteTitle")}</h2>
              </CardTitle>
            </CardHeader>

            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid content-start gap-1.5">
                  <Label htmlFor="invite-email">{t("email")}</Label>
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
                  <Label htmlFor="invite-name">{t("name")}</Label>
                  <Input
                    id="invite-name"
                    name="name"
                    required
                    minLength={2}
                    placeholder="Jordan Reyes"
                    aria-invalid={state.field === "name" ? true : undefined}
                  />
                </div>
                <div className="grid content-start gap-1.5">
                  <Label htmlFor="invite-language">{t("language")}</Label>
                  <Select name="language" defaultValue={locale}>
                    <SelectTrigger id="invite-language" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LOCALES.map((code) => (
                        <SelectItem key={code} value={code}>
                          {LOCALE_NAMES[code]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <fieldset className="mt-5">
                <legend className="text-sm leading-none font-medium text-foreground select-none">{t("role")}</legend>
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
                          {roles(role)}
                        </span>
                        <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                          {roles(`descriptions.${role}`)}
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
