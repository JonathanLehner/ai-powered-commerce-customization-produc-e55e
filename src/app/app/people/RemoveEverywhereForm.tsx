"use client";

import { useTranslations } from "next-intl";
import { useFormStatus } from "react-dom";
import { removePersonEverywhere } from "@/app/actions/team";
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
 * Removes a person from every store they are on. The dialog lists those stores,
 * and the form posts exactly those memberships, so nothing unlisted is removed.
 */
export function RemoveEverywhereForm({
  email,
  name,
  stores,
}: {
  email: string;
  name: string;
  stores: { membershipId: string; storeName: string }[];
}) {
  const formId = `remove-person-${email}`;
  return (
    <form id={formId} action={removePersonEverywhere}>
      <input type="hidden" name="email" value={email} />
      {stores.map((s) => (
        <input key={s.membershipId} type="hidden" name="membershipId" value={s.membershipId} />
      ))}
      <RemoveDialog formId={formId} name={name} stores={stores.map((s) => s.storeName)} />
    </form>
  );
}

function RemoveDialog({ formId, name, stores }: { formId: string; name: string; stores: string[] }) {
  const { pending } = useFormStatus();
  const t = useTranslations("people");
  const common = useTranslations("common");

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive" size="sm" disabled={pending}>
          {pending ? common("working") : t("removeAll")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("removeTitle", { name })}</AlertDialogTitle>
          <AlertDialogDescription>{t("removeBody", { name, count: stores.length })}</AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
          {stores.map((store) => (
            <li key={store}>{store}</li>
          ))}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel />
          <AlertDialogAction type="submit" form={formId} variant="destructive" disabled={pending}>
            {t("removeAll")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
