"use client";

import { SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { importInventoryFile, saveInventorySettingsForm } from "@/app/actions/inventory";
import { ActionForm } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { INVENTORY_FILTERS, type InventoryFilter } from "@/lib/inventory-rules";
import type { InventorySettings } from "@/lib/types";

/** Search and stock filter, submitted as a GET form so a shared link shows the same rows. */
export function InventoryToolbar({ base, q, filter }: { base: string; q: string; filter: InventoryFilter }) {
  const [value, setValue] = useState<string>(filter);
  const t = useTranslations("inventory");

  return (
    <Card size="sm" asChild>
      <form method="get" action={base}>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="min-w-[12rem] flex-1">
            <Label htmlFor="q" className="text-xs">
              {t("search")}
            </Label>
            <div className="relative mt-1.5">
              <SearchIcon
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input id="q" name="q" defaultValue={q} placeholder={t("searchPlaceholder")} className="pl-8" />
            </div>
          </div>
          <div>
            <Label htmlFor="filter" className="text-xs">
              {t("filter")}
            </Label>
            <Select name="filter" value={value} onValueChange={setValue}>
              <SelectTrigger id="filter" className="mt-1.5 w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INVENTORY_FILTERS.map((key) => (
                  <SelectItem key={key} value={key}>
                    {t(`filters.${key}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" variant="outline">
            {t("apply")}
          </Button>
          {q || filter !== "all" ? (
            <Button asChild variant="ghost">
              <Link href={base} prefetch={false}>
                {t("clear")}
              </Link>
            </Button>
          ) : null}
        </CardContent>
      </form>
    </Card>
  );
}

/** Uploads a CSV in the export's own format. */
export function InventoryImport({ storeId }: { storeId: string }) {
  const t = useTranslations("inventory");
  const router = useRouter();
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>{t("import")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("importTitle")}</DialogTitle>
          <DialogDescription>{t("importBody")}</DialogDescription>
        </DialogHeader>
        <ActionForm
          action={async (state, formData) => {
            const result = await importInventoryFile(state, formData);
            if (result.status === "success") router.refresh();
            return result;
          }}
          hidden={{ storeId }}
          submitLabel={t("importSubmit")}
          pendingLabel={t("importing")}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="inventory-file">{t("importFile")}</Label>
            <Input id="inventory-file" name="file" type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" required />
          </div>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

export function InventorySettingsForm({ storeId, settings }: { storeId: string; settings: InventorySettings }) {
  const t = useTranslations("inventory");
  return (
    <ActionForm action={saveInventorySettingsForm} hidden={{ storeId }} submitLabel={t("saveSettings")} submitVariant="outline">
      {(state) => (
        <div className="space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="lowStockThreshold">{t("threshold")}</Label>
            <Input
              id="lowStockThreshold"
              name="lowStockThreshold"
              type="number"
              min={0}
              max={10000}
              step={1}
              defaultValue={settings.lowStockThreshold}
              className="w-28"
              aria-invalid={state.field === "lowStockThreshold" ? true : undefined}
            />
          </div>
          <div className="flex items-start gap-3">
            <Switch id="showLowStock" name="showLowStock" defaultChecked={settings.showLowStock} />
            <Label htmlFor="showLowStock" className="grid gap-1 font-normal">
              <span className="font-medium text-foreground">{t("showLowStock")}</span>
              <span className="text-xs text-muted-foreground">{t("showLowStockHint")}</span>
            </Label>
          </div>
        </div>
      )}
    </ActionForm>
  );
}
