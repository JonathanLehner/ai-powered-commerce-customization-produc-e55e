"use client";

import { ImageIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useState } from "react";
import { saveEntry, translateEntry } from "@/app/actions/content";
import { ActionForm, Field } from "@/components/forms";
import { RichTextEditor } from "@/components/RichTextEditor";
import { StoredImageFields } from "@/components/StoredImageFields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CONTENT_LIMITS, type ContentField } from "@/lib/content";
import type { FieldTranslations } from "@/lib/translations";
import type { ContentKind, StoredImage } from "@/lib/types";
import { uploadImage } from "@/lib/upload-client";

const IMAGE_MAX_MB = 8;

export interface EditableEntry {
  id: string;
  kind: ContentKind;
  title: string;
  handle: string;
  body: string;
  excerpt: string;
  seoTitle: string;
  seoDescription: string;
  coverImageUrl: string | null;
  status: "draft" | "published";
  translations: FieldTranslations;
}

/** The entry's fields, saved together. A cover image is stored as soon as it is chosen. */
export function EntryForm({ storeId, entry }: { storeId: string; entry: EditableEntry }) {
  const t = useTranslations("content");
  const [uploaded, setUploaded] = useState<StoredImage | null>(null);
  const [removed, setRemoved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = removed ? null : (uploaded?.url ?? entry.coverImageUrl);

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setError(null);
    if (file.size > IMAGE_MAX_MB * 1024 * 1024) {
      setError(t("imageTooLarge", { size: (file.size / 1024 / 1024).toFixed(1), max: IMAGE_MAX_MB }));
      return;
    }
    setUploading(true);
    try {
      setUploaded(await uploadImage(file, "collection", { storeId }));
      setRemoved(false);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : t("imageFailed"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <ActionForm
      action={saveEntry}
      submitLabel={t("save")}
      pendingLabel={t("saving")}
      hidden={{ storeId, entryId: entry.id }}
      submitDisabled={uploading}
    >
      {(state) => (
        <div className="space-y-5">
          {uploaded && !removed ? <StoredImageFields prefix="cover" image={uploaded} /> : null}
          {removed ? <input type="hidden" name="removeCover" value="1" /> : null}
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t("title")} htmlFor="title">
              <Input
                id="title"
                name="title"
                required
                maxLength={CONTENT_LIMITS.title}
                defaultValue={entry.title}
                className="mt-1.5"
                aria-invalid={state.field === "title" ? true : undefined}
              />
            </Field>
            <Field label={t("handle")} htmlFor="handle" hint={t("handleHint", { path: entry.kind === "page" ? "/pages/" : "/blog/" })}>
              <Input
                id="handle"
                name="handle"
                required
                maxLength={CONTENT_LIMITS.handle}
                defaultValue={entry.handle}
                className="mt-1.5 font-mono"
                aria-invalid={state.field === "handle" ? true : undefined}
                aria-describedby="handle-hint"
              />
            </Field>
          </div>

          <div>
            <Label id="body-label">{t("body")}</Label>
            <RichTextEditor
              name="body"
              defaultValue={entry.body}
              storeId={storeId}
              labelledBy="body-label"
              invalid={state.field === "body"}
            />
          </div>

          <Field label={t("excerpt")} htmlFor="excerpt" hint={entry.kind === "post" ? t("excerptHint") : t("optional")}>
            <Textarea
              id="excerpt"
              name="excerpt"
              rows={2}
              maxLength={CONTENT_LIMITS.excerpt}
              defaultValue={entry.excerpt}
              className="mt-1.5"
              aria-invalid={state.field === "excerpt" ? true : undefined}
            />
          </Field>

          <div>
            <p className="text-sm leading-none font-medium text-foreground">{t("cover")}</p>
            <div className="mt-2 flex flex-wrap items-start gap-4">
              <div
                className="flex w-48 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted"
                style={{ aspectRatio: "16 / 9" }}
              >
                {preview ? (
                  <Image src={preview} alt="" width={384} height={216} sizes="192px" className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon aria-hidden className="size-5 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <label htmlFor="cover-image" className="sr-only">
                  {t("cover")}
                </label>
                <Input
                  id="cover-image"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={uploading}
                  onChange={onFile}
                  aria-describedby="cover-image-hint"
                  className="file:mr-3 file:rounded-md file:border-0 file:bg-canvas file:px-3 file:py-1.5 file:text-sm"
                />
                <p id="cover-image-hint" className="text-xs text-muted-foreground">
                  {t("coverHint", { max: IMAGE_MAX_MB })}
                </p>
                {preview ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={uploading}
                    onClick={() => {
                      setUploaded(null);
                      setRemoved(true);
                    }}
                  >
                    {t("removeCover")}
                  </Button>
                ) : null}
                <p role="status" aria-live="polite" className="text-sm">
                  {uploading ? <span className="text-muted-foreground">{t("uploading")}</span> : null}
                  {error ? <span className="text-destructive">{error}</span> : null}
                </p>
              </div>
            </div>
          </div>

          <fieldset className="space-y-4 rounded-lg border border-border p-4">
            <legend className="px-1 text-sm font-medium text-foreground">{t("seo")}</legend>
            <Field label={t("seoTitle")} htmlFor="seoTitle" hint={t("seoTitleHint")}>
              <Input
                id="seoTitle"
                name="seoTitle"
                maxLength={CONTENT_LIMITS.seoTitle}
                defaultValue={entry.seoTitle}
                className="mt-1.5"
                aria-invalid={state.field === "seoTitle" ? true : undefined}
              />
            </Field>
            <Field label={t("seoDescription")} htmlFor="seoDescription" hint={t("seoDescriptionHint")}>
              <Textarea
                id="seoDescription"
                name="seoDescription"
                rows={2}
                maxLength={CONTENT_LIMITS.seoDescription}
                defaultValue={entry.seoDescription}
                className="mt-1.5"
                aria-invalid={state.field === "seoDescription" ? true : undefined}
              />
            </Field>
          </fieldset>

          <div className="flex items-start gap-2.5 text-sm text-inksoft">
            <Switch id="published" name="published" defaultChecked={entry.status === "published"} className="mt-0.5" />
            <Label htmlFor="published" className="block cursor-pointer font-normal">
              {t("visible")}
            </Label>
          </div>
        </div>
      )}
    </ActionForm>
  );
}

const TRANSLATED: ContentField[] = ["title", "excerpt", "seoTitle", "seoDescription"];

/** The entry in one of the store's other languages. Empty fields show the source text. */
export function EntryTranslations({
  storeId,
  entry,
  languages,
}: {
  storeId: string;
  entry: EditableEntry;
  /** The store's other languages, code and name. */
  languages: { code: string; name: string }[];
}) {
  const t = useTranslations("content");
  const [locale, setLocale] = useState(languages[0]?.code ?? "");
  if (languages.length === 0) return <p className="text-sm text-muted-foreground">{t("noLanguages")}</p>;
  const value = (key: ContentField) => entry.translations[locale]?.[key]?.value ?? "";
  const labels: Record<ContentField, string> = {
    title: t("title"),
    excerpt: t("excerpt"),
    body: t("body"),
    seoTitle: t("seoTitle"),
    seoDescription: t("seoDescription"),
  };

  return (
    <div className="space-y-4">
      <div className="max-w-xs">
        <Label htmlFor="translation-language">{t("language")}</Label>
        <Select value={locale} onValueChange={setLocale}>
          <SelectTrigger id="translation-language" className="mt-1.5 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {languages.map((language) => (
              <SelectItem key={language.code} value={language.code}>
                {language.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <ActionForm
        key={locale}
        action={translateEntry}
        submitLabel={t("saveTranslation")}
        pendingLabel={t("saving")}
        hidden={{ storeId, entryId: entry.id, locale }}
      >
        {(state) => (
          <div className="space-y-4">
            {TRANSLATED.map((key) => (
              <Field key={key} label={labels[key]} htmlFor={`tr-${key}`} hint={entry[key] ? t("source", { text: entry[key] }) : undefined}>
                {key === "excerpt" || key === "seoDescription" ? (
                  <Textarea
                    id={`tr-${key}`}
                    name={key}
                    rows={2}
                    maxLength={CONTENT_LIMITS[key]}
                    defaultValue={value(key)}
                    className="mt-1.5"
                    aria-invalid={state.field === "values" ? true : undefined}
                  />
                ) : (
                  <Input
                    id={`tr-${key}`}
                    name={key}
                    maxLength={CONTENT_LIMITS[key]}
                    defaultValue={value(key)}
                    className="mt-1.5"
                    aria-invalid={state.field === "values" ? true : undefined}
                  />
                )}
              </Field>
            ))}
            <div>
              <Label id="tr-body-label">{labels.body}</Label>
              <RichTextEditor name="body" defaultValue={value("body")} storeId={storeId} labelledBy="tr-body-label" />
            </div>
          </div>
        )}
      </ActionForm>
    </div>
  );
}
