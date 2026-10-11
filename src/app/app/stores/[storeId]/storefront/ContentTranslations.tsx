"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { saveCatalogueTranslation, saveProductTranslation } from "@/app/actions/translations";
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

/**
 * Products or gift portals in one language: what a shopper reads, whether it
 * is translated, and a sheet to translate it. In the default language the
 * source is edited where it lives, in the catalog or gifting.
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
  kind: "product" | "portal";
  storeId: string;
  locale: string;
  defaultLocale: string;
  languageLabel: string;
  sourceLabel: string;
  items: TranslatableItem[];
  onSaved: (id: string, translations: FieldTranslations) => void;
}) {
  const t = useTranslations("editor.content");
  const [editing, setEditing] = useState<string | null>(null);
  const isDefault = locale === defaultLocale;
  const current = items.find((item) => item.id === editing) ?? null;

  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
        {kind === "product" ? t("noProducts") : t("noPortals")}
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
              <TableHead className="pl-4">{kind === "product" ? t("product") : t("portal")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead className="pr-4 text-right">
                <span className="sr-only">{t("edit")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const state = rowState(item, locale, defaultLocale);
              const shown = kind === "product" ? localized(item.name, item.translations, locale, defaultLocale, "name") : item.name;
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
                      <Link href={item.href} className={buttonVariants({ variant: "outline", size: "sm" })}>
                        {kind === "product" ? t("editSource") : t("editPortal")}
                      </Link>
                    ) : (
                      <Button type="button" variant="outline" size="sm" onClick={() => setEditing(item.id)}>
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
          {current ? (
            <TranslationForm
              key={`${current.id}:${locale}`}
              kind={kind}
              storeId={storeId}
              locale={locale}
              languageLabel={languageLabel}
              sourceLabel={sourceLabel}
              item={current}
              onSaved={(translations) => {
                onSaved(current.id, translations);
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
  kind: "product" | "portal";
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
    if (key === "name" || key === "description" || key === "textLabel" || key === "intro") return t(`fields.${key}`);
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
