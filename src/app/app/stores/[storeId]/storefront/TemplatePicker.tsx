"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { applyStoreTemplate, previewStoreTemplate } from "@/app/actions/storefront";
import type { ActionState } from "@/app/actions/stores";
import { FormStatus } from "@/components/forms";
import { TemplateGallery, type GalleryTemplate } from "@/components/TemplateGallery";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

/**
 * "Change template" in the storefront editor: browse the templates, preview
 * one with the store's own products, and apply it to the draft. The draft it
 * replaces stays in the version history, and nothing goes live until the
 * draft is published.
 */
export function TemplatePicker({
  storeId,
  locale,
  templates,
  categories,
  styles,
  currentTemplateId,
}: {
  storeId: string;
  /** The language the store's own preview is drawn in. */
  locale: string;
  templates: GalleryTemplate[];
  categories: { key: string; label: string }[];
  styles: { key: string; label: string }[];
  currentTemplateId: string | null;
}) {
  const t = useTranslations("templates.picker");
  const g = useTranslations("templates");
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<GalleryTemplate | null>(null);
  const [addProducts, setAddProducts] = useState(false);
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null);
  const [status, setStatus] = useState<ActionState>({ status: "idle" });

  async function preview() {
    if (!chosen || busy) return;
    // Opened before the link arrives, so the browser does not block it as a popup.
    const tab = window.open("about:blank", "_blank");
    setBusy("preview");
    try {
      const result = await previewStoreTemplate({ storeId, templateId: chosen.id, locale });
      if ("url" in result && tab) tab.location.href = result.url;
      else {
        tab?.close();
        setStatus({ status: "error", message: "error" in result ? result.error : t("failed") });
      }
    } catch {
      tab?.close();
      setStatus({ status: "error", message: t("failed") });
    } finally {
      setBusy(null);
    }
  }

  async function apply() {
    if (!chosen || busy) return;
    setBusy("apply");
    setStatus({ status: "idle" });
    try {
      const result = await applyStoreTemplate({ storeId, templateId: chosen.id, addStarterProducts: addProducts });
      setStatus(result);
      // The canvas holds the draft it was opened with, so it is loaded again.
      if (result.status === "success") window.location.reload();
      else setBusy(null);
    } catch {
      setStatus({ status: "error", message: t("failed") });
      setBusy(null);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        setOpen(next);
        if (!next) {
          setChosen(null);
          setStatus({ status: "idle" });
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          {t("open")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>{chosen ? chosen.name : t("title")}</DialogTitle>
          <DialogDescription>{chosen ? chosen.description : t("body")}</DialogDescription>
        </DialogHeader>
        {chosen ? (
          <div className="grid gap-6 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={chosen.image} srcSet={chosen.imageSrcSet} sizes="600px" alt="" className="aspect-[4/3] w-full rounded-lg border border-border object-cover object-top" />
            <div className="space-y-4 text-sm">
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>{t("replaces")}</li>
                <li>{t("keeps")}</li>
                <li>{t("history")}</li>
                <li>{t("unsaved")}</li>
              </ul>
              <div className="flex items-start gap-2.5">
                <Checkbox id="template-products" checked={addProducts} onCheckedChange={(v) => setAddProducts(v === true)} disabled={busy !== null} />
                <Label htmlFor="template-products" className="leading-snug font-normal">
                  {t("addProducts")}
                </Label>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={apply} disabled={busy !== null}>
                  {busy === "apply" ? t("applying") : currentTemplateId === chosen.id ? t("reapply") : t("apply")}
                </Button>
                <Button type="button" variant="outline" onClick={preview} disabled={busy !== null}>
                  {busy === "preview" ? t("opening") : t("preview")}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setChosen(null)} disabled={busy !== null}>
                  {t("back")}
                </Button>
              </div>
              <FormStatus state={status} />
            </div>
          </div>
        ) : (
          <TemplateGallery
            templates={templates}
            categories={categories}
            styles={styles}
            labels={{
              all: g("all"),
              allStyles: g("allStyles"),
              category: g("category"),
              style: g("style"),
              preview: g("livePreview"),
              details: g("details"),
              none: g("none"),
            }}
            onPick={(id) => setChosen(templates.find((tpl) => tpl.id === id) ?? null)}
            pickLabel={t("choose")}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
