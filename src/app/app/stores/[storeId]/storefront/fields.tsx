"use client";

import { useTranslations } from "next-intl";
import React, { createContext, useContext, useId, useState } from "react";
import { SfIcon, type StorefrontContext } from "@/components/storefront/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ICONS, type SectionField } from "@/lib/storefront-schema";
import { I18N_PROP, translationOf, translationState, withTranslation, type FieldTranslations } from "@/lib/translations";
import { uploadImage } from "@/lib/upload-client";
import { StateBadge } from "./ContentTranslations";

/**
 * The editor's field controls, generated from a field list: the same controls
 * edit a home page section, the header and footer settings and a product page
 * block. Each edits a `PropTarget`, so where the value is kept (a Craft node,
 * the page's root, a block in the product page template) is the caller's
 * business.
 */

export interface PropTarget {
  /** Unique on the page, for the controls' ids. */
  id: string;
  props: Record<string, unknown>;
  set: (mutate: (props: Record<string, unknown>) => void) => void;
}

export interface FieldEnv {
  storeId: string;
  ctx: StorefrontContext;
  locale: string;
  defaultLocale: string;
}

export const FieldEnvContext = createContext<FieldEnv | null>(null);
function useEnv(): FieldEnv {
  const env = useContext(FieldEnvContext);
  if (!env) throw new Error("FieldEnvContext missing");
  return env;
}

const lcfirst = (s: string) => s[0].toLowerCase() + s.slice(1);

/**
 * A field's label in the reader's language: the section's own wording, else
 * the shared one, else "Slide 2: Headline" built from the numbered pattern,
 * else the schema's English.
 */
export function useFieldText() {
  const t = useTranslations("editor");
  const has = (key: string) => t.has(key as "add");
  const say = (key: string, values?: Record<string, string | number>) => t(key as "add", values as never);
  return {
    label(scope: string | null, field: SectionField): string {
      if (scope && has(`${scope}.fields.${field.key}`)) return say(`${scope}.fields.${field.key}`);
      if (has(`fields.${field.key}`)) return say(`fields.${field.key}`);
      const match = /^([a-z]+?)(\d)([A-Z]\w*)?$/.exec(field.key);
      if (match && has(`repeat.${match[1]}`)) {
        const prefix = say(`repeat.${match[1]}`, { n: Number(match[2]) });
        if (!match[3]) return prefix;
        const rest = lcfirst(match[3]);
        return has(`fields.${rest}`) ? `${prefix}: ${say(`fields.${rest}`)}` : prefix;
      }
      return field.label;
    },
    help(scope: string | null, field: SectionField): string | null {
      if (scope && has(`${scope}.fields.${field.key}Help`)) return say(`${scope}.fields.${field.key}Help`);
      if (has(`help.${field.key}`)) return say(`help.${field.key}`);
      return field.help ?? null;
    },
    option(value: string, fallback: string): string {
      return has(`options.${value}`) ? say(`options.${value}`) : fallback;
    },
  };
}

/** Whether a style field applies to the section as it is set up. */
function visible(field: SectionField, props: Record<string, unknown>): boolean {
  if (field.companion) return false;
  if (field.key === "backgroundColor") return props.background === "custom";
  if (field.key === "backgroundImage") return props.background === "image";
  const column = /^column\d(Icon|Image)$/.exec(field.key);
  if (column) return (props.media ?? "icon") === (column[1] === "Icon" ? "icon" : "image");
  return true;
}

/** Every field of a section, block or settings group: content first, then style. */
export function FieldList({ fields, target, scope }: { fields: SectionField[]; target: PropTarget; scope: string | null }) {
  const t = useTranslations("editor");
  const content = fields.filter((f) => (f.group ?? "content") === "content" && visible(f, target.props));
  const style = fields.filter((f) => f.group === "style" && visible(f, target.props));
  return (
    <div className="space-y-3.5">
      {content.map((field) => (
        <FieldControl key={field.key} field={field} target={target} scope={scope} />
      ))}
      {style.length > 0 ? (
        <>
          <Separator className="my-4" />
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("style")}</p>
          {style.map((field) => (
            <FieldControl key={field.key} field={field} target={target} scope={scope} />
          ))}
        </>
      ) : null}
    </div>
  );
}

export function FieldControl({ field, target, scope }: { field: SectionField; target: PropTarget; scope: string | null }) {
  const env = useEnv();
  const text = useFieldText();
  const t = useTranslations("editor");
  const isDefault = env.locale === env.defaultLocale;
  const id = `field-${target.id}-${field.key}`;
  const label = text.label(scope, field);
  const help = text.help(scope, field);
  const value = target.props[field.key];
  const set = (next: unknown) =>
    target.set((p) => {
      p[field.key] = next;
    });

  if (field.type === "text" || field.type === "textarea") {
    return <CopyField target={target} fieldKey={field.key} label={label} long={field.type === "textarea"} help={help} />;
  }
  if (field.type === "toggle") {
    return (
      <div className="flex items-start gap-2.5">
        <Switch id={id} disabled={!isDefault} checked={value !== false} onCheckedChange={(checked) => set(checked)} className="mt-0.5" />
        <Label htmlFor={id} className="cursor-pointer text-sm font-normal">
          {label}
        </Label>
      </div>
    );
  }
  if (field.type === "image") return <ImageField target={target} field={field} label={label} help={help} disabled={!isDefault} />;
  if (field.type === "video") return <VideoField target={target} field={field} label={label} help={help} disabled={!isDefault} />;

  let control: React.ReactNode;
  switch (field.type) {
    case "select":
      control = (
        <Select disabled={!isDefault} value={String(value ?? "")} onValueChange={set}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {text.option(option.value, option.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
      break;
    case "collection": {
      const collections = env.ctx.collections ?? [];
      const current = collections.some((c) => c.id === value) ? String(value) : "all";
      control = (
        <Select disabled={!isDefault} value={current} onValueChange={(next) => set(next === "all" && field.key !== "source" ? "" : next)}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{field.key === "source" ? t("options.all") : t("link.automatic")}</SelectItem>
            {collections.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
      break;
    }
    case "product": {
      const current = env.ctx.products.some((p) => p.id === value) ? String(value) : "newest";
      control = (
        <Select disabled={!isDefault} value={current} onValueChange={(next) => set(next === "newest" ? "" : next)}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">{t("link.newest")}</SelectItem>
            {env.ctx.products.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
      break;
    }
    case "link":
      control = <LinkControl id={id} value={String(value ?? "")} onChange={set} disabled={!isDefault} />;
      break;
    case "icon":
      control = (
        <Select disabled={!isDefault} value={String(value || "sparkles")} onValueChange={set}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ICONS.map((icon) => (
              <SelectItem key={icon} value={icon}>
                <SfIcon name={icon} className="size-4" />
                {t(`icons.${icon}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
      break;
    case "color": {
      const hex = typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : "";
      control = (
        <div className="flex items-center gap-2">
          <input
            id={id}
            type="color"
            disabled={!isDefault}
            value={hex || "#888888"}
            onChange={(e) => set(e.target.value)}
            className="h-8 w-10 shrink-0 cursor-pointer rounded border border-input bg-background p-0.5"
          />
          <Input
            aria-label={label}
            disabled={!isDefault}
            value={hex}
            placeholder="#000000"
            onChange={(e) => {
              const next = e.target.value.trim();
              if (next === "" || /^#[0-9a-f]{6}$/i.test(next)) set(next.toLowerCase());
            }}
            className="h-8 font-mono text-xs"
          />
        </div>
      );
      break;
    }
    case "datetime": {
      const parsed = typeof value === "string" && value ? new Date(value) : null;
      const local =
        parsed && !Number.isNaN(parsed.getTime())
          ? new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
          : "";
      control = (
        <Input
          id={id}
          type="datetime-local"
          disabled={!isDefault}
          value={local}
          onChange={(e) => set(e.target.value ? new Date(e.target.value).toISOString() : "")}
        />
      );
      break;
    }
    case "number":
      control = (
        <Input
          id={id}
          disabled={!isDefault}
          type="number"
          min={field.min}
          max={field.max}
          value={String(value ?? "")}
          onChange={(e) => set(e.target.value === "" ? "" : Number(e.target.value))}
          className="tabular-nums"
        />
      );
      break;
    default:
      control = <Input id={id} disabled={!isDefault} value={String(value ?? "")} onChange={(e) => set(e.target.value)} />;
  }
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      {control}
      {help ? <p className="text-xs text-muted-foreground">{help}</p> : null}
    </div>
  );
}

/**
 * One piece of copy. In the default language it edits the source; in any
 * other it edits that language's translation, with the source as the
 * placeholder and a badge while it is missing or machine-translated. Typing
 * is a person saving it, so the machine mark goes.
 */
export function CopyField({
  target,
  fieldKey,
  label,
  long,
  help,
}: {
  target: PropTarget;
  fieldKey: string;
  label: string;
  long: boolean;
  help?: string | null;
}) {
  const { locale, defaultLocale } = useEnv();
  const isDefault = locale === defaultLocale;
  const source = String(target.props[fieldKey] ?? "");
  const translations = target.props[I18N_PROP] as FieldTranslations | undefined;
  const value = isDefault ? source : (translationOf(translations, locale, fieldKey)?.value ?? "");
  const id = `field-${target.id}-${fieldKey}`;

  function change(next: string) {
    target.set((p) => {
      if (isDefault) p[fieldKey] = next;
      else p[I18N_PROP] = withTranslation(p[I18N_PROP] as FieldTranslations | undefined, locale, fieldKey, next);
    });
  }

  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="text-xs">
          {label}
        </Label>
        <StateBadge state={translationState(source, translations, locale, defaultLocale, fieldKey)} />
      </div>
      {long ? (
        <Textarea id={id} rows={3} value={value} placeholder={isDefault ? undefined : source} onChange={(e) => change(e.target.value)} />
      ) : (
        <Input id={id} value={value} placeholder={isDefault ? undefined : source} onChange={(e) => change(e.target.value)} />
      )}
      {help ? <p className="text-xs text-muted-foreground">{help}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ links */

function LinkControl({ id, value, onChange, disabled }: { id: string; value: string; onChange: (next: string) => void; disabled: boolean }) {
  const { ctx } = useEnv();
  const t = useTranslations("editor.link");
  const known =
    value === "" ||
    value === "products" ||
    value === "cart" ||
    (value.startsWith("collection:") && ctx.collections?.some((c) => `collection:${c.id}` === value)) ||
    (value.startsWith("product:") && ctx.products.some((p) => `product:${p.id}` === value));
  const [custom, setCustom] = useState(!known);
  const choice = custom ? "custom" : value === "" ? "none" : value;
  return (
    <div className="grid gap-1.5">
      <Select
        disabled={disabled}
        value={choice}
        onValueChange={(next) => {
          if (next === "custom") {
            setCustom(true);
            onChange("https://");
            return;
          }
          setCustom(false);
          onChange(next === "none" ? "" : next);
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{t("none")}</SelectItem>
          <SelectItem value="products">{t("products")}</SelectItem>
          <SelectItem value="cart">{t("cart")}</SelectItem>
          {(ctx.collections ?? []).map((c) => (
            <SelectItem key={c.id} value={`collection:${c.id}`}>
              {t("collection", { name: c.name ?? c.handle })}
            </SelectItem>
          ))}
          {ctx.products.slice(0, 50).map((p) => (
            <SelectItem key={p.id} value={`product:${p.id}`}>
              {t("product", { name: p.name })}
            </SelectItem>
          ))}
          <SelectItem value="custom">{t("custom")}</SelectItem>
        </SelectContent>
      </Select>
      {custom ? (
        <Input aria-label={t("customUrl")} disabled={disabled} value={value} placeholder="https://" onChange={(e) => onChange(e.target.value.trim())} />
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------- images */

/**
 * A copy of the photo at most `width` pixels wide, as WebP where the browser
 * can write it. Small PNGs and WebPs are kept as they are, so a logo keeps
 * its transparency.
 */
async function resized(file: File, width: number): Promise<File> {
  const bitmap = await createImageBitmap(file);
  if (bitmap.width <= width && file.size < 1_200_000 && file.type !== "image/jpeg") return file;
  const scale = Math.min(1, width / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const encode = (type: string, quality: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  let blob = await encode("image/webp", 0.82);
  if (!blob || blob.type !== "image/webp") blob = await encode("image/jpeg", 0.85);
  if (!blob) return file;
  const base = file.name.replace(/\.[^.]+$/, "") || "image";
  return new File([blob], `${base}-${canvas.width}.${blob.type === "image/webp" ? "webp" : "jpg"}`, { type: blob.type });
}

function ImageField({
  target,
  field,
  label,
  help,
  disabled,
}: {
  target: PropTarget;
  field: SectionField;
  label: string;
  help: string | null;
  disabled: boolean;
}) {
  const { storeId } = useEnv();
  const t = useTranslations("editor.image");
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = field.key;
  const url = String(target.props[key] ?? "");
  const focal = String(target.props[`${key}Focal`] ?? "50 50");
  const [fx, fy] = focal.split(" ").map((n) => Number(n) || 50);

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      const [large, small] = await Promise.all([resized(file, 2000), resized(file, 960)]);
      const stored = await uploadImage(large, "section", { storeId });
      const phone = small === large ? null : await uploadImage(small, "section", { storeId });
      target.set((p) => {
        p[key] = stored.url;
        p[`${key}Small`] = phone?.url ?? "";
        p[`${key}Focal`] = "50 50";
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("failed"));
    } finally {
      setBusy(false);
    }
  }

  function setFocal(x: number, y: number) {
    const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
    target.set((p) => {
      p[`${key}Focal`] = `${clamp(x)} ${clamp(y)}`;
    });
  }

  return (
    <fieldset className="grid gap-2 rounded-lg border border-border p-2.5">
      <legend className="px-1 text-xs font-medium text-foreground">{label}</legend>
      {url ? (
        <button
          type="button"
          disabled={disabled}
          className="relative block aspect-video w-full cursor-crosshair overflow-hidden rounded-md bg-muted"
          onClick={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            setFocal(((e.clientX - box.left) / box.width) * 100, ((e.clientY - box.top) / box.height) * 100);
          }}
          aria-label={t("focalPick")}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="h-full w-full object-cover" style={{ objectPosition: `${fx}% ${fy}%` }} />
          <span
            aria-hidden
            className="pointer-events-none absolute size-4 -translate-1/2 rounded-full border-2 border-white bg-primary shadow"
            style={{ left: `${fx}%`, top: `${fy}%` }}
          />
        </button>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <input id={inputId} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={onFile} disabled={disabled || busy} />
        <Button type="button" size="sm" variant="outline" disabled={disabled || busy} asChild>
          <label htmlFor={inputId} className="cursor-pointer">
            {busy ? t("uploading") : url ? t("replace") : t("upload")}
          </label>
        </Button>
        {url ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled || busy}
            onClick={() =>
              target.set((p) => {
                p[key] = "";
                p[`${key}Small`] = "";
              })
            }
          >
            {t("remove")}
          </Button>
        ) : null}
      </div>
      <Input
        aria-label={t("url")}
        disabled={disabled || busy}
        placeholder={t("urlPlaceholder")}
        value={url}
        onChange={(e) =>
          target.set((p) => {
            p[key] = e.target.value.trim();
            p[`${key}Small`] = "";
          })
        }
        className="h-8 text-xs"
      />
      {url ? (
        <div className="grid grid-cols-2 gap-2">
          <Label className="grid gap-1 text-[11px] font-normal text-muted-foreground">
            {t("focalX")}
            <Input type="number" min={0} max={100} disabled={disabled} value={fx} onChange={(e) => setFocal(Number(e.target.value), fy)} className="h-7 text-xs" />
          </Label>
          <Label className="grid gap-1 text-[11px] font-normal text-muted-foreground">
            {t("focalY")}
            <Input type="number" min={0} max={100} disabled={disabled} value={fy} onChange={(e) => setFocal(fx, Number(e.target.value))} className="h-7 text-xs" />
          </Label>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {help ? <p className="text-xs text-muted-foreground">{help}</p> : null}
    </fieldset>
  );
}

function VideoField({
  target,
  field,
  label,
  help,
  disabled,
}: {
  target: PropTarget;
  field: SectionField;
  label: string;
  help: string | null;
  disabled: boolean;
}) {
  const { storeId } = useEnv();
  const t = useTranslations("editor.image");
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = String(target.props[field.key] ?? "");

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      const stored = await uploadImage(file, "sectionVideo", { storeId });
      target.set((p) => {
        p[field.key] = stored.url;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset className="grid gap-2 rounded-lg border border-border p-2.5">
      <legend className="px-1 text-xs font-medium text-foreground">{label}</legend>
      <div className="flex flex-wrap items-center gap-2">
        <input id={inputId} type="file" accept="video/mp4,video/webm" className="sr-only" onChange={onFile} disabled={disabled || busy} />
        <Button type="button" size="sm" variant="outline" disabled={disabled || busy} asChild>
          <label htmlFor={inputId} className="cursor-pointer">
            {busy ? t("uploading") : url ? t("replaceVideo") : t("uploadVideo")}
          </label>
        </Button>
        {url ? (
          <Button type="button" size="sm" variant="ghost" disabled={disabled || busy} onClick={() => target.set((p) => void (p[field.key] = ""))}>
            {t("remove")}
          </Button>
        ) : null}
      </div>
      <Input
        aria-label={t("url")}
        disabled={disabled || busy}
        placeholder={t("videoPlaceholder")}
        value={url}
        onChange={(e) => target.set((p) => void (p[field.key] = e.target.value.trim()))}
        className="h-8 text-xs"
      />
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {help ? <p className="text-xs text-muted-foreground">{help}</p> : null}
    </fieldset>
  );
}
