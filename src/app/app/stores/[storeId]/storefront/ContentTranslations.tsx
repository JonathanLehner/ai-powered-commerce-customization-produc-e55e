"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import {
  saveCatalogueTranslation,
  saveCollectionTranslation,
  saveProductSeo,
  saveProductTranslation,
} from "@/app/actions/translations";
import { Badge } from "@/components/ui";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/sonner";
import { SEO_LIMITS } from "@/lib/seo";
import {
  localized,
  translationOf,
  translationState,
  type FieldTranslations,
  type TranslationState,
} from "@/lib/translations";

export interface TranslatableItem {
  id: string;
  /** The name in the default language. */
  name: string;
  /** Where the source text is edited. */
  href: string;
  fields: { key: string; source: string; long?: boolean }[];
  translations: FieldTranslations;
}

/** What a save hands back: new translations, or new source text for some fields. */
export type ItemUpdate = { translations?: FieldTranslations; sources?: Record<string, string> };

/** The search title and description, edited in the default language here rather than in the catalog. */
const SEO_KEYS = ["seoTitle", "seoDescription"] as const;

/** The state badge shown beside a field or a row in a language. */
export function StateBadge({ state }: { state: TranslationState }) {
  const t = useTranslations("editor.content");
  if (state === "missing") return <Badge tone="amber">{t("notTranslated")}</Badge>;
  if (state === "machine") return <Badge tone="iris">{t("machine")}</Badge>;
  return null;
}

function rowState(item: TranslatableItem, locale: string, defaultLocale: string): TranslationState {
  const states = item.fields.map((f) => translationState(f.source, item.translations, locale, defaultLocale, f.key));
  if (states.includes("missing")) return "missing";
  if (states.includes("machine")) return "machine";
  return states.includes("translated") ? "translated" : "source";
}

type ContentKind = "product" | "collection" | "portal";

/**
 * Products, collections or gift portals in one language: what a shopper reads,
 * whether it is translated, and a sheet to translate it. In the default
 * language the source is edited where it lives, in the catalog or gifting.
 */
export function ContentTranslations({
  kind,
  storeId,
  locale,
  defaultLocale,
  languageLabel,
  sourceLabel,
  items,
  onSaved,
}: {
  kind: ContentKind;
  storeId: string;
  locale: string;
  defaultLocale: string;
  languageLabel: string;
  sourceLabel: string;
  items: TranslatableItem[];
  onSaved: (id: string, update: ItemUpdate) => void;
}) {
  const t = useTranslations("editor.content");
  const [editing, setEditing] = useState<{ id: string; seo: boolean } | null>(null);
  const isDefault = locale === defaultLocale;
  const current = items.find((item) => item.id === editing?.id) ?? null;

  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
        {kind === "product" ? t("noProducts") : kind === "collection" ? t("noCollections") : t("noPortals")}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {isDefault ? <p className="text-sm text-muted-foreground">{t("defaultNote")}</p> : null}
      <div className="overflow-hidden rounded-xl border border-border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">
                {kind === "product" ? t("product") : kind === "collection" ? t("collection") : t("portal")}
              </TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead className="pr-4 text-right">
                <span className="sr-only">{t("edit")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const state = rowState(item, locale, defaultLocale);
              const shown =
                kind === "portal" ? item.name : localized(item.name, item.translations, locale, defaultLocale, "name");
              return (
                <TableRow key={item.id}>
                  <TableCell className="pl-4 font-medium text-foreground">{shown}</TableCell>
                  <TableCell>
                    {state === "translated" ? (
                      <Badge tone="green">{t("translated")}</Badge>
                    ) : state === "source" ? (
                      <span className="text-xs text-muted-foreground">{sourceLabel}</span>
                    ) : (
                      <StateBadge state={state} />
                    )}
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    {isDefault ? (
                      <div className="flex justify-end gap-2">
                        {kind === "product" ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setEditing({ id: item.id, seo: true })}
                          >
                            {t("seo")}
                          </Button>
                        ) : null}
                        <Link href={item.href} className={buttonVariants({ variant: "outline", size: "sm" })}>
                          {kind === "portal" ? t("editPortal") : t("editSource")}
                        </Link>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setEditing({ id: item.id, seo: false })}
                      >
                        {t("edit")}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Sheet open={current !== null} onOpenChange={(open) => (open ? null : setEditing(null))}>
        <SheetContent side="right" className="w-full data-[side=right]:sm:max-w-lg">
          {current && editing?.seo ? (
            <SeoForm
              key={`${current.id}:seo`}
              storeId={storeId}
              item={current}
              onSaved={(sources) => {
                onSaved(current.id, { sources });
                setEditing(null);
              }}
            />
          ) : current ? (
            <TranslationForm
              key={`${current.id}:${locale}`}
              kind={kind}
              storeId={storeId}
              locale={locale}
              languageLabel={languageLabel}
              sourceLabel={sourceLabel}
              item={current}
              onSaved={(translations) => {
                onSaved(current.id, { translations });
                setEditing(null);
              }}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function TranslationForm({
  kind,
  storeId,
  locale,
  languageLabel,
  sourceLabel,
  item,
  onSaved,
}: {
  kind: ContentKind;
  storeId: string;
  locale: string;
  languageLabel: string;
  sourceLabel: string;
  item: TranslatableItem;
  onSaved: (translations: FieldTranslations) => void;
}) {
  const t = useTranslations("editor.content");
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(item.fields.map((f) => [f.key, translationOf(item.translations, locale, f.key)?.value ?? ""])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function label(key: string, source: string) {
    if (key.startsWith("colour:")) return t("fields.colour", { colour: source });
    if (key.startsWith("tag:")) return t("fields.tag", { tag: source });
    if (
      key === "name" ||
      key === "description" ||
      key === "textLabel" ||
      key === "intro" ||
      key === "seoTitle" ||
      key === "seoDescription"
    ) {
      return t(`fields.${key}`);
    }
    return key;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result =
        kind === "product"
          ? await saveProductTranslation({ storeId, productId: item.id, locale, values })
          : kind === "collection"
            ? await saveCollectionTranslation({ storeId, collectionId: item.id, locale, values })
            : await saveCatalogueTranslation({ storeId, catalogueId: item.id, locale, intro: values.intro ?? "" });
      if (result.status === "error" || !result.translations) {
        setError(result.message ?? t("failed"));
        return;
      }
      toast.success(result.message);
      onSaved(result.translations);
    } catch {
      setError(t("failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader className="border-b border-border">
        <SheetTitle>{item.name}</SheetTitle>
        <SheetDescription>{t("sheetDescription", { language: languageLabel, source: sourceLabel })}</SheetDescription>
      </SheetHeader>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {item.fields.map((field) => {
          const id = `translate-${item.id}-${field.key}`;
          const entry = translationOf(item.translations, locale, field.key);
          const state: TranslationState = entry ? (entry.machine ? "machine" : "translated") : "missing";
          return (
            <div key={field.key} className="grid gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor={id} className="text-xs">
                  {label(field.key, field.source)}
                </Label>
                <StateBadge state={state} />
              </div>
              {field.long ? (
                <Textarea
                  id={id}
                  rows={6}
                  value={values[field.key] ?? ""}
                  placeholder={field.source}
                  onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                />
              ) : (
                <Input
                  id={id}
                  value={values[field.key] ?? ""}
                  placeholder={field.source}
                  onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                />
              )}
            </div>
          );
        })}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
      <SheetFooter className="border-t border-border">
        <Button type="submit" disabled={busy}>
          {busy ? t("saving") : t("save")}
        </Button>
      </SheetFooter>
    </form>
  );
}

/** A product's search title and description in the default language. */
function SeoForm({
  storeId,
  item,
  onSaved,
}: {
  storeId: string;
  item: TranslatableItem;
  onSaved: (sources: Record<string, string>) => void;
}) {
  const t = useTranslations("editor.content");
  const source = (key: string) => item.fields.find((f) => f.key === key)?.source ?? "";
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(SEO_KEYS.map((key) => [key, source(key)])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fallback: Record<string, string> = {
    seoTitle: item.name,
    seoDescription: source("description").split("\n")[0] ?? "",
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await saveProductSeo({
        storeId,
        productId: item.id,
        seoTitle: values.seoTitle ?? "",
        seoDescription: values.seoDescription ?? "",
      });
      if (result.status === "error") {
        setError(result.message ?? t("failed"));
        return;
      }
      toast.success(result.message);
      onSaved({ seoTitle: result.seoTitle ?? "", seoDescription: result.seoDescription ?? "" });
    } catch {
      setError(t("failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader className="border-b border-border">
        <SheetTitle>{item.name}</SheetTitle>
        <SheetDescription>{t("seoDescription")}</SheetDescription>
      </SheetHeader>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {SEO_KEYS.map((key) => {
          const id = `seo-${item.id}-${key}`;
          const props = {
            id,
            value: values[key] ?? "",
            maxLength: SEO_LIMITS[key],
            placeholder: fallback[key],
            onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
              setValues((v) => ({ ...v, [key]: e.target.value })),
          };
          return (
            <div key={key} className="grid gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor={id} className="text-xs">
                  {t(`fields.${key}`)}
                </Label>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {(values[key] ?? "").length}/{SEO_LIMITS[key]}
                </span>
              </div>
              {key === "seoDescription" ? <Textarea rows={4} {...props} /> : <Input {...props} />}
            </div>
          );
        })}
        <p className="text-xs text-muted-foreground">{t("seoFallback")}</p>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
      <SheetFooter className="border-t border-border">
        <Button type="submit" disabled={busy}>
          {busy ? t("saving") : t("saveSeo")}
        </Button>
      </SheetFooter>
    </form>
  );
}
