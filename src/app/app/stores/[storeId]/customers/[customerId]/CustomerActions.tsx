"use client";

import { CopyIcon, DownloadIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { addNote, deleteCustomerData } from "@/app/actions/customers";
import { ActionForm, FormStatus, SubmissionKey, SuccessToast, useSubmission } from "@/components/forms";
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
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { Textarea } from "@/components/ui/textarea";

export function CopyEmailButton({ email }: { email: string }) {
  const t = useTranslations("customers");
  const common = useTranslations("common");

  async function copy() {
    try {
      await navigator.clipboard.writeText(email);
      toast.success(t("emailCopied"));
    } catch {
      toast.error(common("copyFailed"));
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={copy}>
      <CopyIcon />
      {t("copyEmail")}
    </Button>
  );
}

/** The download only starts once confirmed, because the file holds the customer's personal data. */
export function ExportDataButton({ href }: { href: string }) {
  const t = useTranslations("customers");

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <DownloadIcon />
          {t("exportData")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("exportTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("exportBody")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel />
          <AlertDialogAction asChild>
            <a href={href} download>
              {t("exportConfirm")}
            </a>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Deletion cannot be undone, so it is confirmed in an alert dialog whose action
 * submits this form by id: the dialog renders in a portal outside it. The
 * button stays locked while the request runs.
 */
export function DeleteDataButton({ storeId, customerId }: { storeId: string; customerId: string }) {
  const t = useTranslations("customers");
  const common = useTranslations("common");
  const [{ state }, formAction, pending] = useSubmission(deleteCustomerData, { status: "idle" });
  const formId = `delete-${customerId}`;

  return (
    <form id={formId} action={formAction}>
      <input type="hidden" name="storeId" value={storeId} />
      <input type="hidden" name="customerId" value={customerId} />
      <SuccessToast state={state} />
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="outline" size="sm" disabled={pending} className="text-destructive">
            <Trash2Icon />
            {pending ? common("working") : t("deleteData")}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction type="submit" form={formId} variant="destructive" disabled={pending}>
              {t("deleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {state.status === "error" ? <FormStatus state={state} /> : null}
    </form>
  );
}

export function NoteForm({ storeId, customerId }: { storeId: string; customerId: string }) {
  const t = useTranslations("customers");

  return (
    <ActionForm
      action={addNote}
      submitLabel={t("addNote")}
      pendingLabel={t("addingNote")}
      submitSize="sm"
      hidden={{ storeId, customerId }}
    >
      {(state) => (
        <div className="grid gap-1.5">
          <SubmissionKey status={state.status} prefix="note" />
          <Label htmlFor="body">{t("noteLabel")}</Label>
          <Textarea id="body" name="body" rows={3} maxLength={2000} aria-invalid={state.field === "body" || undefined} />
        </div>
      )}
    </ActionForm>
  );
}
