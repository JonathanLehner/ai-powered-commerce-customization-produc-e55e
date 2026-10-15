"use client";

import { useTranslations } from "next-intl";
import { useFormStatus } from "react-dom";
import {
  addPlatformAdmin,
  removePlatformAdmin,
  resendPlatformAdminInvitation,
  type PlatformAdminInviteState,
} from "@/app/actions/platform-admins";
import type { ActionState } from "@/app/actions/stores";
import { CopyField, Field, FormStatus, SubmitButton, useSubmission, useValueRestore } from "@/components/forms";
import { Callout } from "@/components/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/** The invitation link, shown once to the administrator who issued it. */
function InviteLink({ state }: { state: PlatformAdminInviteState }) {
  const t = useTranslations("admin.admins");
  if (state.status !== "success" || !state.url) return null;
  return (
    <Callout tone="green" title={state.message}>
      <p className="mb-3">{t("linkBody")}</p>
      <CopyField value={state.url} label={t("copyLink")} />
    </Callout>
  );
}

export function AddPlatformAdminForm() {
  const t = useTranslations("admin.admins");
  const [{ state, attempt }, formAction] = useSubmission<PlatformAdminInviteState>(addPlatformAdmin, { status: "idle" });
  const { formRef, capture } = useValueRestore(state.status, attempt);

  return (
    <div className="space-y-4">
      <InviteLink state={state} />
      <Card asChild>
        <form
          ref={formRef}
          action={(formData: FormData) => {
            capture(formData);
            formAction(formData);
          }}
          noValidate
        >
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Field label={t("name")} htmlFor="admin-name">
              <Input
                id="admin-name"
                name="name"
                maxLength={80}
                autoComplete="off"
                className="mt-1.5"
                aria-invalid={state.field === "name" ? true : undefined}
              />
            </Field>
            <Field label={t("email")} htmlFor="admin-email">
              <Input
                id="admin-email"
                name="email"
                type="email"
                maxLength={254}
                autoComplete="off"
                className="mt-1.5"
                aria-invalid={state.field === "email" ? true : undefined}
              />
            </Field>
          </CardContent>
          <div className="px-(--card-spacing)">
            <FormStatus state={state.status === "success" ? { status: "idle" } : state} />
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <SubmitButton pendingLabel={t("adding")}>{t("add")}</SubmitButton>
            </div>
          </div>
        </form>
      </Card>
    </div>
  );
}

/** Resend and remove for one administrator, with the outcome under the buttons. */
export function PlatformAdminActions({
  userId,
  name,
  invited,
  self,
}: {
  userId: string;
  name: string;
  invited: boolean;
  self: boolean;
}) {
  const t = useTranslations("admin.admins");
  const [resent, resendAction] = useSubmission<PlatformAdminInviteState>(resendPlatformAdminInvitation, { status: "idle" });
  const [removed, removeAction] = useSubmission<ActionState>(removePlatformAdmin, { status: "idle" });
  const formId = `remove-admin-${userId}`;

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {invited ? (
          <form action={resendAction}>
            <input type="hidden" name="userId" value={userId} />
            <SubmitButton size="sm" variant="outline" pendingLabel={t("resending")}>
              {t("resend")}
            </SubmitButton>
          </form>
        ) : null}
        {self ? null : (
          <form id={formId} action={removeAction}>
            <input type="hidden" name="userId" value={userId} />
            <RemoveDialog formId={formId} name={name} />
          </form>
        )}
      </div>
      <div className="max-w-md text-left">
        <InviteLink state={resent.state} />
        <FormStatus state={resent.state.status === "error" ? resent.state : { status: "idle" }} />
        <FormStatus state={removed.state} />
      </div>
    </div>
  );
}

function RemoveDialog({ formId, name }: { formId: string; name: string }) {
  const { pending } = useFormStatus();
  const t = useTranslations("admin.admins");
  const common = useTranslations("common");

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive" size="sm" disabled={pending}>
          {pending ? common("working") : t("remove")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("removeTitle", { name })}</AlertDialogTitle>
          <AlertDialogDescription>{t("removeBody", { name })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel />
          <AlertDialogAction type="submit" form={formId} variant="destructive" disabled={pending}>
            {t("remove")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
