"use client";

import { renameStore, setStoreStatus } from "@/app/actions/stores";
import { ActionForm, ConfirmSubmit } from "@/components/forms";
import type { Store } from "@/lib/types";
import { formatDate } from "@/lib/util";

export function StoreAdminPanel({ store }: { store: Store }) {
  const archived = store.status === "archived";

  return (
    <section className="card p-5">
      <h2 className="text-base font-semibold text-ink">Store administration</h2>
      <p className="mt-1 text-sm text-muted">
        Renaming a store changes how it appears in the workspace and on the storefront. Its web address
        (<span className="font-mono text-xs">/s/{store.slug}</span>) stays the same so existing links keep working.
      </p>

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <ActionForm
          action={renameStore}
          submitLabel="Save name"
          submitClassName="btn-secondary"
          hidden={{ storeId: store.id }}
        >
          {(state) => (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="rename-name" className="field-label">
                  Store name
                </label>
                <input
                  id="rename-name"
                  name="name"
                  defaultValue={store.name}
                  required
                  minLength={3}
                  aria-invalid={state.field === "name" ? true : undefined}
                  className={state.field === "name" ? "input input-error" : "input"}
                />
              </div>
              <div>
                <label htmlFor="rename-client" className="field-label">
                  Client
                </label>
                <input
                  id="rename-client"
                  name="clientName"
                  defaultValue={store.clientName}
                  required
                  aria-invalid={state.field === "clientName" ? true : undefined}
                  className={state.field === "clientName" ? "input input-error" : "input"}
                />
              </div>
            </div>
          )}
        </ActionForm>

        <div className="rounded-xl border border-line bg-canvas p-4">
          <h3 className="text-sm font-semibold text-ink">
            {archived ? "Restore this store" : "Archive this store"}
          </h3>
          <p className="mt-1.5 text-sm text-muted">
            {archived
              ? `Archived ${store.archivedAt ? formatDate(store.archivedAt) : ""}. Restoring puts the storefront back online and lets the store take orders again.`
              : "Archiving takes the storefront offline and stops new orders. Products, orders and audit history are kept."}
          </p>
          <form action={setStoreStatus} className="mt-4">
            <input type="hidden" name="storeId" value={store.id} />
            <input type="hidden" name="status" value={archived ? "active" : "archived"} />
            {archived ? (
              <button type="submit" className="btn-primary btn-sm">
                Restore store
              </button>
            ) : (
              <ConfirmSubmit
                confirmLabel="Yes, archive it"
                question="Take the storefront offline?"
                className="btn-danger btn-sm"
              >
                Archive store
              </ConfirmSubmit>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}
