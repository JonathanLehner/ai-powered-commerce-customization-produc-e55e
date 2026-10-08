"use client";

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

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" disabled={pending}>
          {pending ? "Working…" : "Withdraw"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Withdraw this enquiry?</AlertDialogTitle>
          <AlertDialogDescription>
            {code} is closed to further quotes and the sourcing desk stops work on it. Any quote already
            recorded can no longer be accepted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction type="submit" form={formId} variant="destructive" disabled={pending}>
            Withdraw
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
