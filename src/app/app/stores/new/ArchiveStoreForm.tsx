"use client";

import { useTranslations } from "next-intl";
import { useFormStatus } from "react-dom";
import { setStoreStatus } from "@/app/actions/stores";
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

/** Frees a place under the plan limit without losing the store's records. */
export function ArchiveStoreForm({ storeId, storeName }: { storeId: string; storeName: string }) {
  const formId = `archive-${storeId}`;

  return (
    <form id={formId} action={setStoreStatus}>
      <input type="hidden" name="storeId" value={storeId} />
      <input type="hidden" name="status" value="archived" />
      <ArchiveDialog formId={formId} storeName={storeName} />
    </form>
  );
}

function ArchiveDialog({ formId, storeName }: { formId: string; storeName: string }) {
  // Inside the form, so the trigger locks the moment the dialog submits it.
  const { pending } = useFormStatus();
  const t = useTranslations("newStore");
  const common = useTranslations("common");

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive" size="sm" disabled={pending}>
          {pending ? common("working") : t("archive")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("archiveQuestion", { name: storeName })}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("archiveDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel />
          <AlertDialogAction type="submit" form={formId} variant="destructive" disabled={pending}>
            {t("archiveConfirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
