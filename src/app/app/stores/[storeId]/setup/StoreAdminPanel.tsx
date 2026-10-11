"use client";

import { useLocale, useTranslations } from "next-intl";
import { useFormStatus } from "react-dom";
import { renameStore, setStoreStatus } from "@/app/actions/stores";
import { ActionForm } from "@/components/forms";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Store } from "@/lib/types";
import { formatDate } from "@/lib/util";

export function StoreAdminPanel({ store }: { store: Store }) {
  const archived = store.status === "archived";
  const formId = `store-status-${store.id}`;
  const t = useTranslations("settings");
  const locale = useLocale();

  return (
    <Card asChild>
    <section>
      <CardHeader>
      <CardTitle asChild>
        <h2>{t("storeDetails")}</h2>
      </CardTitle>
      <p className="text-sm text-muted-foreground">
        {t("storeAddress")} <span className="font-mono text-xs">/s/{store.slug}</span>
      </p>
      </CardHeader>

      <CardContent className="grid gap-6 lg:grid-cols-2">
        <ActionForm
          action={renameStore}
          submitLabel={t("saveName")}
          submitVariant="outline"
          hidden={{ storeId: store.id }}
        >
          {(state) => (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid content-start gap-1.5">
                <Label htmlFor="rename-name">{t("storeName")}</Label>
                <Input
                  id="rename-name"
                  name="name"
                  defaultValue={store.name}
                  required
                  minLength={3}
                  aria-invalid={state.field === "name" ? true : undefined}
                />
              </div>
              <div className="grid content-start gap-1.5">
                <Label htmlFor="rename-client">{t("client")}</Label>
                <Input
                  id="rename-client"
                  name="clientName"
                  defaultValue={store.clientName}
                  required
                  aria-invalid={state.field === "clientName" ? true : undefined}
                />
              </div>
            </div>
          )}
        </ActionForm>

        <div className="rounded-xl border border-border bg-canvas p-4">
          <h3 className="text-sm font-semibold text-foreground">
            {archived ? t("restoreTitle") : t("archiveTitle")}
          </h3>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {archived
              ? t("archivedOn", { date: store.archivedAt ? formatDate(store.archivedAt, locale) : "" })
              : t("archivedNote")}
          </p>
          <form id={formId} action={setStoreStatus} className="mt-4">
            <input type="hidden" name="storeId" value={store.id} />
            <input type="hidden" name="status" value={archived ? "active" : "archived"} />
            {archived ? (
              <RestoreButton />
            ) : (
              <ArchiveDialog formId={formId} />
            )}
          </form>
        </div>
      </CardContent>
    </section>
    </Card>
  );
}

function RestoreButton() {
  const { pending } = useFormStatus();
  const t = useTranslations("settings");
  const common = useTranslations("common");
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? common("working") : t("restoreStore")}
    </Button>
  );
}

/**
 * Archiving takes the storefront offline, so it is confirmed in an alert
 * dialog. The dialog's own action submits the form by id, because the dialog is
 * rendered in a portal outside it.
 */
function ArchiveDialog({ formId }: { formId: string }) {
  const { pending } = useFormStatus();
  const t = useTranslations("settings");
  const common = useTranslations("common");

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive" size="sm" disabled={pending}>
          {pending ? common("working") : t("archiveStore")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("archiveQuestion")}</AlertDialogTitle>
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
