"use client";

import { CheckIcon, ImageIcon, PlusIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useState } from "react";
import { flushSync } from "react-dom";
import {
  addCollectionProducts,
  removeCollectionProduct,
  reorderCollectionProducts,
  saveCollectionDetails,
} from "@/app/actions/collections";
import { ActionForm, Field } from "@/components/forms";
import { SortableList } from "@/components/SortableList";
import { Badge } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/sonner";
import { COLLECTION_LIMITS } from "@/lib/collections";
import type { StoredImage } from "@/lib/types";
import { uploadImage } from "@/lib/upload-client";
import { cn } from "@/lib/utils";

const IMAGE_MAX_MB = 8;

export interface CollectionDetails {
  id: string;
  name: string;
  handle: string;
  description: string;
  imageUrl: string | null;
}

/** Mirrors `readStoredImage` on the server. */
function StoredImageFields({ prefix, image }: { prefix: string; image: StoredImage }) {
  const fields: [string, string][] = [
    ["Url", image.url],
    ["Name", image.fileName],
    ["Type", image.mimeType],
    ["Bytes", String(image.sizeBytes)],
    ["Width", String(image.pixelWidth)],
    ["Height", String(image.pixelHeight)],
    ["Alpha", image.hasAlpha ? "1" : "0"],
  ];
  return (
    <>
      {fields.map(([suffix, value]) => (
        <input key={suffix} type="hidden" name={`${prefix}${suffix}`} value={value} />
      ))}
    </>
  );
}

/**
 * Name, address, description and image. The image is stored the moment it is
 * chosen and the form saves with it, as the store logo does.
 */
export function CollectionDetailsForm({
  storeId,
  collection,
  canEdit,
}: {
  storeId: string;
  collection: CollectionDetails;
  canEdit: boolean;
}) {
  const t = useTranslations("collections");
  const [uploaded, setUploaded] = useState<StoredImage | null>(null);
  const [removed, setRemoved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = removed ? null : (uploaded?.url ?? collection.imageUrl);

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    const form = event.currentTarget.form;
    event.currentTarget.value = "";
    if (!file) return;
    setError(null);
    if (file.size > IMAGE_MAX_MB * 1024 * 1024) {
      setError(t("imageTooLarge", { size: (file.size / 1024 / 1024).toFixed(1), max: IMAGE_MAX_MB }));
      return;
    }
    setUploading(true);
    try {
      const stored = await uploadImage(file, "collection", { storeId });
      // The hidden fields have to be in the DOM before the form is submitted.
      flushSync(() => {
        setUploaded(stored);
        setRemoved(false);
      });
      form?.requestSubmit();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : t("imageFailed"));
    } finally {
      setUploading(false);
    }
  }

  function removeImage(form: HTMLFormElement | null) {
    flushSync(() => {
      setUploaded(null);
      setRemoved(true);
    });
    form?.requestSubmit();
  }

  if (!canEdit) {
    return (
      <div className="space-y-3 text-sm">
        <p className="font-medium text-foreground">{collection.name}</p>
        <p className="font-mono text-xs text-muted-foreground">/collections/{collection.handle}</p>
        {collection.description ? (
          <p className="whitespace-pre-line text-muted-foreground">{collection.description}</p>
        ) : null}
      </div>
    );
  }

  return (
    <ActionForm
      action={saveCollectionDetails}
      submitLabel={t("save")}
      hidden={{ storeId, collectionId: collection.id }}
      submitDisabled={uploading}
    >
      {(state) => (
        <div className="space-y-4">
          {uploaded && !removed ? <StoredImageFields prefix="image" image={uploaded} /> : null}
          {removed ? <input type="hidden" name="removeImage" value="1" /> : null}
          <Field label={t("name")} htmlFor="name">
            <Input
              id="name"
              name="name"
              required
              maxLength={COLLECTION_LIMITS.name}
              defaultValue={collection.name}
              className="mt-1.5"
              aria-invalid={state.field === "name" ? true : undefined}
            />
          </Field>
          <Field label={t("handle")} htmlFor="handle" hint={t("handleHint")}>
            <Input
              id="handle"
              name="handle"
              required
              maxLength={COLLECTION_LIMITS.handle}
              defaultValue={collection.handle}
              className="mt-1.5 font-mono"
              aria-invalid={state.field === "handle" ? true : undefined}
              aria-describedby="handle-hint"
            />
          </Field>
          <Field label={t("descriptionLabel")} htmlFor="description" hint={t("optional")}>
            <Textarea
              id="description"
              name="description"
              rows={4}
              maxLength={COLLECTION_LIMITS.description}
              defaultValue={collection.description}
              className="mt-1.5"
              aria-invalid={state.field === "description" ? true : undefined}
            />
          </Field>
          <div>
            <p className="text-sm leading-none font-medium text-foreground">{t("image")}</p>
            <div className="mt-2 flex flex-wrap items-start gap-4">
              <div
                className="flex w-40 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted"
                style={{ aspectRatio: "3 / 2" }}
              >
                {preview ? (
                  <Image src={preview} alt="" width={320} height={213} sizes="160px" className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon aria-hidden className="size-5 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <label htmlFor="collection-image" className="sr-only">
                  {t("image")}
                </label>
                <Input
                  id="collection-image"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={uploading}
                  onChange={onFile}
                  aria-describedby="collection-image-hint"
                  className="file:mr-3 file:rounded-md file:border-0 file:bg-canvas file:px-3 file:py-1.5 file:text-sm"
                />
                <p id="collection-image-hint" className="text-xs text-muted-foreground">
                  {t("imageHint", { max: IMAGE_MAX_MB })}
                </p>
                {preview ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={uploading}
                    onClick={(e) => removeImage(e.currentTarget.form)}
                  >
                    {t("removeImage")}
                  </Button>
                ) : null}
                <p role="status" aria-live="polite" className="text-sm">
                  {uploading ? <span className="text-muted-foreground">{t("uploading")}</span> : null}
                  {error ? <span className="text-destructive">{error}</span> : null}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </ActionForm>
  );
}

export interface PickableProduct {
  id: string;
  name: string;
  sku: string;
  imageUrl: string | null;
  /** Published, public and approved: what a shopper can see. */
  live: boolean;
  statusLabel: string;
}

/**
 * The products in a collection, in the order the storefront shows them under
 * Featured. Every change is saved as it is made.
 */
export function CollectionProducts({
  storeId,
  collectionId,
  initialIds,
  products,
  canEdit,
  className,
}: {
  storeId: string;
  collectionId: string;
  className?: string;
  initialIds: string[];
  /** Every product the store can put in a collection. */
  products: PickableProduct[];
  canEdit: boolean;
}) {
  const t = useTranslations("collections");
  const byId = new Map(products.map((p) => [p.id, p]));
  const [ids, setIds] = useState(() => initialIds.filter((id) => byId.has(id)));
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const items = ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  const available = products.filter((p) => !ids.includes(p.id));

  async function run(
    optimistic: string[],
    call: () => Promise<{ status: string; message?: string; productIds?: string[] }>,
  ) {
    if (busy) return false;
    const before = ids;
    setIds(optimistic);
    setBusy(true);
    try {
      const result = await call();
      if (result.status === "error" || !result.productIds) throw new Error(result.message);
      setIds(result.productIds.filter((id) => byId.has(id)));
      toast.success(result.message ?? t("saved"));
      return true;
    } catch (error) {
      setIds(before);
      toast.error(error instanceof Error && error.message ? error.message : t("saveFailed"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (chosen.length === 0) return;
    const ok = await run([...ids, ...chosen.filter((id) => !ids.includes(id))], () =>
      addCollectionProducts({ storeId, collectionId, productIds: chosen }),
    );
    if (ok) {
      setPicking(false);
      setChosen([]);
    }
  }

  const row = (product: PickableProduct, handle: React.ReactNode) => (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2">
      {canEdit ? handle : null}
      <span className="w-5 text-right text-xs tabular-nums text-muted-foreground">{ids.indexOf(product.id) + 1}</span>
      <Thumb url={product.imageUrl} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{product.name}</p>
        <p className="truncate font-mono text-xs text-muted-foreground">{product.sku}</p>
      </div>
      {product.live ? null : <Badge tone="amber">{product.statusLabel}</Badge>}
      {canEdit ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={busy}
          aria-label={t("remove", { name: product.name })}
          onClick={() =>
            run(
              ids.filter((id) => id !== product.id),
              () => removeCollectionProduct({ storeId, collectionId, productId: product.id }),
            )
          }
        >
          <XIcon aria-hidden />
        </Button>
      ) : null}
    </div>
  );

  return (
    <Card size="sm" className={className}>
      <CardHeader>
        <CardTitle asChild className="text-sm font-semibold">
          <h2>{t("productsTitle", { count: ids.length })}</h2>
        </CardTitle>
        <p className="text-xs text-muted-foreground">{canEdit ? t("productsHint") : t("productsHintReadOnly")}</p>
        {canEdit ? (
          <CardAction>
            <Button type="button" size="sm" onClick={() => setPicking(true)} disabled={busy || available.length === 0}>
              <PlusIcon aria-hidden />
              {t("addProducts")}
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            {t("noProductsInCollection")}
          </p>
        ) : (
          <SortableList
            items={items}
            nameOf={(p) => p.name}
            disabled={!canEdit || busy}
            className="space-y-2"
            onReorder={(next) =>
              run(next, () => reorderCollectionProducts({ storeId, collectionId, productIds: next }))
            }
            renderRow={row}
          />
        )}
      </CardContent>

      <Dialog
        open={picking}
        onOpenChange={(open) => {
          if (busy) return;
          setPicking(open);
          if (!open) setChosen([]);
        }}
      >
        <DialogContent className="gap-0 p-0 sm:max-w-lg">
          <DialogHeader className="border-b border-border p-4">
            <DialogTitle>{t("addProducts")}</DialogTitle>
            <DialogDescription>{t("addDescription")}</DialogDescription>
          </DialogHeader>
          <Command className="rounded-none">
            <CommandInput placeholder={t("searchProducts")} />
            <CommandList className="max-h-80">
              <CommandEmpty>{t("noProductsFound")}</CommandEmpty>
              <CommandGroup>
                {available.map((product) => {
                  const selected = chosen.includes(product.id);
                  return (
                    <CommandItem
                      key={product.id}
                      value={`${product.name} ${product.sku}`}
                      onSelect={() =>
                        setChosen((list) => (selected ? list.filter((id) => id !== product.id) : [...list, product.id]))
                      }
                      aria-selected={selected}
                      className="gap-3"
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input",
                          selected && "border-primary bg-primary text-primary-foreground",
                        )}
                      >
                        {selected ? <CheckIcon className="size-3" /> : null}
                      </span>
                      <Thumb url={product.imageUrl} small />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{product.name}</span>
                        <span className="block truncate font-mono text-xs text-muted-foreground">{product.sku}</span>
                      </span>
                      {product.live ? null : <Badge tone="amber">{product.statusLabel}</Badge>}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
          <DialogFooter className="border-t border-border p-4">
            <Button type="button" variant="outline" onClick={() => setPicking(false)} disabled={busy}>
              {t("cancel")}
            </Button>
            <Button type="button" onClick={add} disabled={busy || chosen.length === 0}>
              {busy ? t("adding") : t("addCount", { count: chosen.length })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Thumb({ url, small = false }: { url: string | null; small?: boolean }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted",
        small ? "size-8" : "size-10",
      )}
    >
      {url ? (
        <Image src={url} alt="" width={80} height={80} sizes="40px" className="h-full w-full object-cover" />
      ) : (
        <ImageIcon aria-hidden className="size-4 text-muted-foreground" />
      )}
    </span>
  );
}
