"use client";

import { useLocale, useTranslations } from "next-intl";
import { invitePerson } from "@/app/actions/team";
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
import { STORE_ROLES } from "@/lib/people";

/** One invitation, any number of stores, a role chosen for each. */
export function InvitePersonForm({ stores }: { stores: { id: string; name: string }[] }) {
  const t = useTranslations("people");
  const team = useTranslations("team");
  const roles = useTranslations("roles");
  const locale = useLocale();
  return (
    <Card asChild>
      <ActionForm
        action={invitePerson}
        submitLabel={team("sendInvitation")}
        pendingLabel={team("sending")}
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
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="grid content-start gap-1.5">
                  <Label htmlFor="person-email">{team("email")}</Label>
                  <Input
                    id="person-email"
                    name="email"
                    type="email"
                    required
                    placeholder="name@company.com"
                    aria-invalid={state.field === "email" ? true : undefined}
                  />
                </div>
                <div className="grid content-start gap-1.5">
                  <Label htmlFor="person-name">{team("name")}</Label>
                  <Input
                    id="person-name"
                    name="name"
                    required
                    minLength={2}
                    placeholder="Jordan Reyes"
                    aria-invalid={state.field === "name" ? true : undefined}
                  />
                </div>
                <div className="grid content-start gap-1.5">
                  <Label htmlFor="person-language">{team("language")}</Label>
                  <Select name="language" defaultValue={locale}>
                    <SelectTrigger id="person-language" className="w-full">
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

              <fieldset className="mt-5" aria-invalid={state.field === "stores" ? true : undefined}>
                <legend className="text-sm leading-none font-medium text-foreground select-none">
                  {t("storeAccess")}
                </legend>
                <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
                  {stores.map((store) => (
                    <li key={store.id} className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5">
                      <Label htmlFor={`person-role-${store.id}`} className="min-w-0 truncate font-medium">
                        {store.name}
                      </Label>
                      <Select name={`role.${store.id}`} defaultValue="none">
                        <SelectTrigger id={`person-role-${store.id}`} size="sm" className="w-52">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t("noAccess")}</SelectItem>
                          {STORE_ROLES.map((role) => (
                            <SelectItem key={role} value={role}>
                              {roles(role)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </li>
                  ))}
                </ul>
              </fieldset>
            </CardContent>
          </>
        )}
      </ActionForm>
    </Card>
  );
}
