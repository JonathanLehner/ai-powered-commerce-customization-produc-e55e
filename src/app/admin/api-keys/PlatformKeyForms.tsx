"use client";

import { useTranslations } from "next-intl";
import type { CreateKeyState } from "@/app/actions/api-keys";
import { createPlatformKey, revokePlatformKey } from "@/app/actions/platform-keys";
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

/** A platform key has one name and one scope; the secret is shown once, above the form. */
export function CreatePlatformKeyForm() {
  const t = useTranslations("apiKeys");
  const [{ state, attempt }, formAction] = useSubmission<CreateKeyState>(createPlatformKey, { status: "idle" });
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
          <SubmissionKey status={state.status} prefix="pkey" />
          <CardContent className="space-y-3">
            <Field label={t("name")} htmlFor="key-name" hint={t("nameHint")}>
              <Input
                id="key-name"
                name="name"
                maxLength={60}
                className="mt-1.5 max-w-md"
                aria-invalid={state.field === "name" ? true : undefined}
              />
            </Field>
            <p className="text-sm text-muted-foreground">{t("platform.access")}</p>
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

export function RevokePlatformKeyForm({ keyId }: { keyId: string }) {
  const t = useTranslations("apiKeys");
  return (
    <form action={revokePlatformKey}>
      <input type="hidden" name="keyId" value={keyId} />
      <ConfirmSubmit size="sm" variant="outline" confirmLabel={t("revoke")} question={t("revokeQuestion")}>
        {t("revoke")}
      </ConfirmSubmit>
    </form>
  );
}
