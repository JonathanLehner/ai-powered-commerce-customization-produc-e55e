"use client";

import { useTranslations } from "next-intl";
import { useFormStatus } from "react-dom";
import { withdrawQuoteRequest } from "@/app/actions/sourcing";
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
 * Withdrawing tells the sourcing desk to stop work and closes the enquiry to
 * further quotes, so it is confirmed in an alert dialog. The dialog's own
 * action submits this form by id, because the dialog is rendered in a portal
 * outside it.
 */
export function WithdrawEnquiry({
  storeId,
  requestId,
  code,
}: {
  storeId: string;
  requestId: string;
  code: string;
}) {
  const formId = `withdraw-${requestId}`;

  return (
    <form id={formId} action={withdrawQuoteRequest}>
      <input type="hidden" name="storeId" value={storeId} />
      <input type="hidden" name="requestId" value={requestId} />
      <WithdrawDialog formId={formId} code={code} />
    </form>
  );
}

function WithdrawDialog({ formId, code }: { formId: string; code: string }) {
  const { pending } = useFormStatus();
  const t = useTranslations("enquiries");
  const common = useTranslations("common");

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" disabled={pending}>
          {pending ? common("working") : t("withdraw")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("withdrawTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("withdrawBody", { code })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel />
          <AlertDialogAction type="submit" form={formId} variant="destructive" disabled={pending}>
            {t("withdraw")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
