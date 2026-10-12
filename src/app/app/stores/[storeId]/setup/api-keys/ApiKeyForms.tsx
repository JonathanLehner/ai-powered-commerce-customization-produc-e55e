"use client";

import { useTranslations } from "next-intl";
import { createKey, revokeKey, type CreateKeyState } from "@/app/actions/api-keys";
import {
  ConfirmSubmit,
  CopyField,
  Field,
  FormStatus,
  SubmissionKey,
  SubmitButton,
  useSubmission,
  useValueRestore,
} from "@/components/forms";
import { Callout } from "@/components/ui";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { API_RESOURCES } from "@/lib/api-scopes";

/**
 * Name, then the access per area. The secret comes back in the answer to this
 * form and is shown once, above the form, until the page is left.
 */
export function CreateKeyForm({ storeId }: { storeId: string }) {
  const t = useTranslations("apiKeys");
  const [{ state, attempt }, formAction] = useSubmission<CreateKeyState>(createKey, { status: "idle" });
  const { formRef, capture } = useValueRestore(state.status, attempt);

  return (
    <div className="space-y-4">
      {state.status === "success" && state.secret ? (
        <Callout tone="green" title={t("secretTitle", { name: state.name ?? "" })}>
          <p className="mb-3">{t("secretBody")}</p>
          <CopyField value={state.secret} label={t("copy")} />
        </Callout>
      ) : null}

      <Card asChild>
        <form
          ref={formRef}
          action={(formData: FormData) => {
            capture(formData);
            formAction(formData);
          }}
          noValidate
        >
          <input type="hidden" name="storeId" value={storeId} />
          <SubmissionKey status={state.status} prefix="key" />
          <CardContent className="space-y-5">
            <Field label={t("name")} htmlFor="key-name" hint={t("nameHint")}>
              <Input
                id="key-name"
                name="name"
                maxLength={60}
                className="mt-1.5 max-w-md"
                aria-invalid={state.field === "name" ? true : undefined}
              />
            </Field>
            <fieldset aria-invalid={state.field === "scopes" ? true : undefined}>
              <legend className="text-sm font-medium text-foreground">{t("access")}</legend>
              <div className="mt-2 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {API_RESOURCES.map((resource) => (
                  <div key={resource} className="flex items-center justify-between gap-3">
                    <Label htmlFor={`scope-${resource}`} className="font-normal text-inksoft">
                      {t(`resources.${resource}`)}
                    </Label>
                    <Select name={`scope_${resource}`} defaultValue="none">
                      <SelectTrigger id={`scope-${resource}`} size="sm" className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("none")}</SelectItem>
                        <SelectItem value="read">{t("read")}</SelectItem>
                        <SelectItem value="write">{t("write")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </fieldset>
          </CardContent>
          <div className="px-(--card-spacing)">
            <FormStatus state={state.status === "success" ? { status: "idle" } : state} />
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <SubmitButton pendingLabel={t("creating")}>{t("create")}</SubmitButton>
            </div>
          </div>
        </form>
      </Card>
    </div>
  );
}

export function RevokeKeyForm({ storeId, keyId }: { storeId: string; keyId: string }) {
  const t = useTranslations("apiKeys");
  return (
    <form action={revokeKey}>
      <input type="hidden" name="storeId" value={storeId} />
      <input type="hidden" name="keyId" value={keyId} />
      <ConfirmSubmit size="sm" variant="outline" confirmLabel={t("revoke")} question={t("revokeQuestion")}>
        {t("revoke")}
      </ConfirmSubmit>
    </form>
  );
}
