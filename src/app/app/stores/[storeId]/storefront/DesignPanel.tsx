"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { saveStoreDesign } from "@/app/actions/storefront";
import type { ActionState } from "@/app/actions/stores";
import { FormStatus } from "@/components/forms";
import { Badge } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  BODY_FONT_KEYS,
  BUTTON_STYLES,
  COLOUR_KEYS,
  contrastReport,
  DENSITIES,
  FONT_KEYS,
  FONT_PAIRINGS,
  FONTS,
  fontStack,
  MODES,
  PRESET_DESIGNS,
  PRODUCT_IMAGES,
  RADII,
  resolveDesign,
  type FontKey,
  type StoreDesign,
} from "@/lib/store-design";
import { THEMES, type ThemeKey } from "@/lib/types";

export interface DesignState {
  theme: ThemeKey;
  design: StoreDesign;
}

/**
 * The store's look: a preset to start from, then brand colours, type, corners,
 * buttons, density, light or dark, and product photo shape. Changes show on
 * the canvas straight away and go live when saved.
 */
export function DesignPanel({
  storeId,
  value,
  saved,
  drafted = false,
  onChange,
  onSaved,
}: {
  storeId: string;
  value: DesignState;
  saved: DesignState;
  /** The design is part of the draft: it is saved with it and goes live when it is published. */
  drafted?: boolean;
  onChange: (next: DesignState) => void;
  onSaved: (next: DesignState) => void;
}) {
  const t = useTranslations("editor.design");
  const labels = useTranslations("labels");
  const [status, setStatus] = useState<ActionState>({ status: "idle" });
  const [busy, setBusy] = useState(false);
  const resolved = resolveDesign({ theme: value.theme, design: value.design });
  const contrast = contrastReport(resolved);
  const dirty = JSON.stringify(value) !== JSON.stringify(saved);

  const patch = (next: Partial<StoreDesign>) => onChange({ ...value, design: { ...value.design, ...next } });
  const colour = (key: (typeof COLOUR_KEYS)[number], hex: string) =>
    onChange({ ...value, design: { ...value.design, colors: { ...(value.design.colors ?? {}), [key]: hex.toLowerCase() } } });

  async function save() {
    if (busy) return;
    setBusy(true);
    setStatus({ status: "idle" });
    try {
      const result = await saveStoreDesign({ storeId, theme: value.theme, design: value.design });
      setStatus(result);
      if (result.status === "success") onSaved(value);
    } catch {
      setStatus({ status: "error", message: t("saveFailed") });
    } finally {
      setBusy(false);
    }
  }

  const choice = <T extends string>(id: string, label: string, options: readonly T[], current: T, set: (next: T) => void) => (
    <div className="grid gap-1.5">
      <span id={id} className="text-xs font-medium text-foreground">
        {label}
      </span>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        spacing={0}
        aria-labelledby={id}
        value={current}
        onValueChange={(next) => next && set(next as T)}
        className="flex-wrap"
      >
        {options.map((option) => (
          <ToggleGroupItem key={option} value={option} className="px-3">
            {t(`values.${option}` as "values.light")}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );

  const fontSelect = (id: string, label: string, keys: FontKey[], current: FontKey, set: (next: FontKey) => void) => (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Select value={current} onValueChange={(next) => set(next as FontKey)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {keys.map((key) => (
            <SelectItem key={key} value={key}>
              <span style={{ fontFamily: fontStack(key) }}>{FONTS[key].name}</span>
              <span className="text-xs text-muted-foreground">{t(`categories.${FONTS[key].category}`)}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card size="sm">
        <CardHeader>
          <CardTitle asChild className="text-sm font-semibold">
            <h2>{t("presets")}</h2>
          </CardTitle>
          <p className="text-xs text-muted-foreground">{t("presetsBody")}</p>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(THEMES) as ThemeKey[]).map((key) => {
            const preset = PRESET_DESIGNS[key];
            return (
              <button
                key={key}
                type="button"
                aria-pressed={value.theme === key}
                onClick={() => onChange({ theme: key, design: {} })}
                className="rounded-lg border border-border p-3 text-left hover:border-primary/40 aria-pressed:border-primary aria-pressed:bg-primary/5"
              >
                <span className="flex gap-1" aria-hidden>
                  {COLOUR_KEYS.map((c) => (
                    <span key={c} className="size-4 rounded-full border border-border" style={{ background: preset.colors[c] }} />
                  ))}
                </span>
                <span className="mt-2 block text-sm font-semibold text-foreground" style={{ fontFamily: fontStack(preset.headingFont) }}>
                  {THEMES[key].name}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{labels(`theme.${key}`)}</span>
              </button>
            );
          })}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle asChild className="text-sm font-semibold">
            <h2>{t("colours")}</h2>
          </CardTitle>
          <p className="text-xs text-muted-foreground">{t("coloursBody")}</p>
        </CardHeader>
        <CardContent className="grid gap-3">
          {COLOUR_KEYS.map((key) => (
            <div key={key} className="flex items-center gap-3">
              <input
                id={`design-${key}`}
                type="color"
                value={resolved.colors[key]}
                onChange={(e) => colour(key, e.target.value)}
                className="h-8 w-10 shrink-0 cursor-pointer rounded border border-input bg-background p-0.5"
              />
              <Label htmlFor={`design-${key}`} className="w-28 text-sm font-normal">
                {t(`colourNames.${key}`)}
              </Label>
              <Input
                aria-label={t(`colourNames.${key}`)}
                defaultValue={resolved.colors[key]}
                key={resolved.colors[key]}
                onBlur={(e) => /^#[0-9a-f]{6}$/i.test(e.target.value.trim()) && colour(key, e.target.value.trim())}
                className="h-8 max-w-28 font-mono text-xs"
              />
            </div>
          ))}
          <div className="flex flex-wrap gap-2 pt-1 text-xs">
            {(["text", "primary"] as const).map((pair) => (
              <Badge key={pair} tone={contrast[pair].adjusted ? "amber" : "green"}>
                {t(contrast[pair].adjusted ? "contrastAdjusted" : "contrastOk", {
                  pair: t(`colourNames.${pair}`),
                  ratio: contrast[pair].ratio.toFixed(1),
                })}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle asChild className="text-sm font-semibold">
            <h2>{t("type")}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {fontSelect("design-heading", t("headingFont"), FONT_KEYS, resolved.headingFont, (next) => patch({ headingFont: next }))}
          {fontSelect("design-body", t("bodyFont"), BODY_FONT_KEYS, resolved.bodyFont, (next) => patch({ bodyFont: next }))}
          <div className="grid gap-1.5">
            <span className="text-xs font-medium text-foreground">{t("pairings")}</span>
            <div className="flex flex-wrap gap-1.5">
              {FONT_PAIRINGS.map((pair) => (
                <Button
                  key={pair.key}
                  type="button"
                  size="sm"
                  variant={resolved.headingFont === pair.heading && resolved.bodyFont === pair.body ? "default" : "outline"}
                  onClick={() => patch({ headingFont: pair.heading, bodyFont: pair.body })}
                >
                  <span style={{ fontFamily: fontStack(pair.heading) }}>{FONTS[pair.heading].name}</span>
                  <span className="opacity-60">+</span>
                  <span style={{ fontFamily: fontStack(pair.body) }}>{FONTS[pair.body].name}</span>
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle asChild className="text-sm font-semibold">
            <h2>{t("style")}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {choice("design-mode", t("mode"), MODES, resolved.mode, (mode) =>
            onChange({ ...value, design: { ...value.design, mode, colors: {} } }),
          )}
          {choice("design-radius", t("radius"), RADII, resolved.radius, (radius) => patch({ radius }))}
          {choice("design-buttons", t("buttons"), BUTTON_STYLES, resolved.buttonStyle, (buttonStyle) => patch({ buttonStyle }))}
          {choice("design-density", t("density"), DENSITIES, resolved.density, (density) => patch({ density }))}
          {choice("design-images", t("productImage"), PRODUCT_IMAGES, resolved.productImage, (productImage) => patch({ productImage }))}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3 lg:col-span-2">
        {drafted ? null : (
          <Button type="button" onClick={save} disabled={busy || !dirty}>
            {busy ? t("saving") : t("save")}
          </Button>
        )}
        <Button type="button" variant="outline" disabled={busy || !dirty} onClick={() => onChange(saved)}>
          {t("discard")}
        </Button>
        <p className="text-xs text-muted-foreground">{drafted ? t("draftNote") : t("liveNote")}</p>
        <FormStatus state={status} />
      </div>
    </div>
  );
}
