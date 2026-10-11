"use client";

import { ImageIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { createCollection, reorderCollections } from "@/app/actions/collections";
import { ActionForm, Field, SubmissionKey } from "@/components/forms";
import { SortableList } from "@/components/SortableList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/sonner";
import { COLLECTION_LIMITS } from "@/lib/collections";

export function CreateCollectionForm({ storeId }: { storeId: string }) {
  const t = useTranslations("collections");
  return (
    <ActionForm action={createCollection} submitLabel={t("create")} pendingLabel={t("creating")} hidden={{ storeId }}>
      {(state) => (
        <div className="grid gap-4 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
          <SubmissionKey status={state.status} prefix="col" />
          <Field label={t("name")} htmlFor="name">
            <Input
              id="name"
              name="name"
              required
              maxLength={COLLECTION_LIMITS.name}
              placeholder={t("namePlaceholder")}
              className="mt-1.5"
              aria-invalid={state.field === "name" ? true : undefined}
            />
          </Field>
          <Field label={t("descriptionLabel")} htmlFor="description" hint={t("optional")}>
            <Textarea
              id="description"
              name="description"
              rows={2}
              maxLength={COLLECTION_LIMITS.description}
              className="mt-1.5"
              aria-invalid={state.field === "description" ? true : undefined}
            />
          </Field>
        </div>
      )}
    </ActionForm>
  );
}

export interface CollectionRow {
  id: string;
  name: string;
  handle: string;
  imageUrl: string | null;
  productCount: number;
  liveCount: number;
}

/** The store's collections, dragged into the order the editor and shoppers see. */
export function CollectionList({
  storeId,
  collections,
  canEdit,
}: {
  storeId: string;
  collections: CollectionRow[];
  canEdit: boolean;
}) {
  const t = useTranslations("collections");
  const [items, setItems] = useState(collections);
  const [saving, setSaving] = useState(false);

  async function reorder(ids: string[]) {
    if (saving) return;
    const before = items;
    setItems(ids.map((id) => items.find((c) => c.id === id)!).filter(Boolean));
    setSaving(true);
    try {
      const result = await reorderCollections({ storeId, ids });
      if (result.status === "error") throw new Error(result.message);
      toast.success(result.message ?? t("orderSaved"));
    } catch {
      setItems(before);
      toast.error(t("orderFailed"));
    } finally {
      setSaving(false);
    }
  }

  const row = (collection: CollectionRow, handle: React.ReactNode) => (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
      {canEdit ? handle : null}
      <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
        {collection.imageUrl ? (
          <Image
            src={collection.imageUrl}
            alt=""
            width={96}
            height={96}
            sizes="48px"
            className="h-full w-full object-cover"
          />
        ) : (
          <ImageIcon aria-hidden className="size-4 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <Link
          href={`/app/stores/${storeId}/catalog/collections/${collection.id}`}
          className="block truncate text-sm font-medium text-foreground hover:underline"
        >
          {collection.name}
        </Link>
        <p className="truncate text-xs text-muted-foreground">
          <span className="font-mono">/collections/{collection.handle}</span>
          {" · "}
          {t("productCount", { count: collection.productCount })}
          {collection.liveCount < collection.productCount ? ` · ${t("liveCount", { count: collection.liveCount })}` : ""}
        </p>
      </div>
      <Button asChild variant="outline" size="sm" className="shrink-0">
        <Link href={`/app/stores/${storeId}/catalog/collections/${collection.id}`}>
          {canEdit ? t("edit") : t("view")}
        </Link>
      </Button>
    </div>
  );

  return (
    <SortableList
      items={items}
      nameOf={(c) => c.name}
      onReorder={reorder}
      disabled={!canEdit || saving}
      className="space-y-2"
      renderRow={row}
    />
  );
}
