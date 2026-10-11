"use client";

import { useTranslations } from "next-intl";
import { useFormStatus } from "react-dom";
import { setProductStatus } from "@/app/actions/products";
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
 * Taking a live product off the storefront asks first. The dialog renders in a
 * portal outside the form, so its action submits the form by id.
 */
export function UnpublishButton({ storeId, productId, name }: { storeId: string; productId: string; name: string }) {
  const formId = `unpublish-${productId}`;
  return (
    <form id={formId} action={setProductStatus}>
      <input type="hidden" name="storeId" value={storeId} />
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="status" value="in_review" />
      <UnpublishDialog formId={formId} name={name} />
    </form>
  );
}

function UnpublishDialog({ formId, name }: { formId: string; name: string }) {
  // Inside the form, so the trigger locks the moment the dialog submits it.
  const { pending } = useFormStatus();
  const t = useTranslations("catalog");
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" disabled={pending}>
          {pending ? t("unpublishing") : t("unpublish")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("unpublishTitle", { name })}</AlertDialogTitle>
          <AlertDialogDescription>{t("unpublishBody")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel />
          <AlertDialogAction type="submit" form={formId} variant="destructive" disabled={pending}>
            {t("unpublish")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
