"use client";

import { setStoreStatus } from "@/app/actions/stores";
import { ConfirmSubmit } from "@/components/forms";

/** Frees a place under the plan limit without losing the store's records. */
export function ArchiveStoreForm({ storeId, storeName }: { storeId: string; storeName: string }) {
  return (
    <form action={setStoreStatus}>
      <input type="hidden" name="storeId" value={storeId} />
      <input type="hidden" name="status" value="archived" />
      <ConfirmSubmit
        confirmLabel="Yes, archive it"
        question={`Take ${storeName} offline?`}
        className="btn-danger btn-sm"
      >
        Archive
      </ConfirmSubmit>
    </form>
  );
}
