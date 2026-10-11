"use client";

import { useTranslations } from "next-intl";
import { useFormStatus } from "react-dom";
import { regenerateGiftLink } from "@/app/actions/gifting";
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

/**
 * A new address invalidates every link already sent, so it is confirmed in an
 * alert dialog. The dialog's own action submits this form by id, because the
 * dialog is rendered in a portal outside it.
 */
export function RegenerateAccess({ storeId, catalogueId }: { storeId: string; catalogueId: string }) {
  const formId = `regenerate-${catalogueId}`;

  return (
    <form id={formId} action={regenerateGiftLink}>
      <input type="hidden" name="storeId" value={storeId} />
      <input type="hidden" name="catalogueId" value={catalogueId} />
      <RegenerateDialog formId={formId} />
    </form>
  );
}

function RegenerateDialog({ formId }: { formId: string }) {
  const { pending } = useFormStatus();
  const t = useTranslations("gifting");
  const common = useTranslations("common");

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" disabled={pending}>
          {pending ? common("working") : t("regenerate")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("regenerate")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("regenerateBody")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel />
          <AlertDialogAction type="submit" form={formId} variant="destructive" disabled={pending}>
            {t("regenerate")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
