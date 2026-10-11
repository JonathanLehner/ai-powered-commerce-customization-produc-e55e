"use client";

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

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive" size="sm" disabled={pending}>
          {pending ? "Working…" : "Archive"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive {storeName}?</AlertDialogTitle>
          <AlertDialogDescription>
            The storefront goes offline. You can restore it later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction type="submit" form={formId} variant="destructive" disabled={pending}>
            Yes, archive it
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
