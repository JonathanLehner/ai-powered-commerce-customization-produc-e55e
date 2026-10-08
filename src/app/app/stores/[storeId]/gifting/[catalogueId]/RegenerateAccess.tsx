"use client";

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

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" disabled={pending}>
          {pending ? "Working…" : "Regenerate access"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Regenerate access</AlertDialogTitle>
          <AlertDialogDescription>
            Every link already sent stops working and everyone signed in is signed out.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction type="submit" form={formId} variant="destructive" disabled={pending}>
            Regenerate access
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
