"use client";

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

  return (
    <Card asChild>
    <section>
      <CardHeader>
      <CardTitle asChild>
        <h2>Store administration</h2>
      </CardTitle>
      <p className="text-sm text-muted-foreground">
        Renaming a store changes how it appears in the workspace and on the storefront. Its web address
        (<span className="font-mono text-xs">/s/{store.slug}</span>) stays the same so existing links keep working.
      </p>
      </CardHeader>

      <CardContent className="grid gap-6 lg:grid-cols-2">
        <ActionForm
          action={renameStore}
          submitLabel="Save name"
          submitVariant="outline"
          hidden={{ storeId: store.id }}
        >
          {(state) => (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid content-start gap-1.5">
                <Label htmlFor="rename-name">Store name</Label>
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
                <Label htmlFor="rename-client">Client</Label>
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
            {archived ? "Restore this store" : "Archive this store"}
          </h3>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {archived
              ? `Archived ${store.archivedAt ? formatDate(store.archivedAt) : ""}. Restoring puts the storefront back online and lets the store take orders again.`
              : "Archiving takes the storefront offline and stops new orders. Products, orders and audit history are kept."}
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
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Working…" : "Restore store"}
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

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive" size="sm" disabled={pending}>
          {pending ? "Working…" : "Archive store"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Take the storefront offline?</AlertDialogTitle>
          <AlertDialogDescription>
            No new orders can be taken while the store is archived. Products, orders and audit history are
            kept, and the store can be restored from this page.
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
