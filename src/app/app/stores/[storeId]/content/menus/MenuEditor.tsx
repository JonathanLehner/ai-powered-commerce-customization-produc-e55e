"use client";

import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { saveMenu } from "@/app/actions/content";
import { ActionForm } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MENU_LIMITS, MENU_LINK_KINDS, TARGETED_KINDS, type MenuName } from "@/lib/content";
import type { MenuItem, MenuLinkKind } from "@/lib/types";
import { newId } from "@/lib/util";

export interface MenuTargetOptions {
  collection: { id: string; name: string }[];
  product: { id: string; name: string }[];
  page: { id: string; name: string }[];
  post: { id: string; name: string }[];
}

type Row = MenuItem;

/**
 * One menu: its links in order, each with a label, where it goes and the label
 * in the store's other languages. Saved as a whole, so the order on screen is
 * the order shoppers see.
 */
export function MenuEditor({
  storeId,
  menu,
  items,
  targets,
  languages,
}: {
  storeId: string;
  menu: MenuName;
  items: MenuItem[];
  targets: MenuTargetOptions;
  languages: { code: string; name: string }[];
}) {
  const t = useTranslations("content.menus");
  const [rows, setRows] = useState<Row[]>(items);

  const update = (index: number, patch: Partial<Row>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const move = (index: number, by: number) =>
    setRows((current) => {
      const next = [...current];
      const [row] = next.splice(index, 1);
      next.splice(index + by, 0, row);
      return next;
    });
  const translate = (index: number, locale: string, value: string) =>
    setRows((current) =>
      current.map((row, i) =>
        i === index
          ? { ...row, translations: { ...(row.translations ?? {}), [locale]: value ? { label: { value } } : {} } }
          : row,
      ),
    );

  const kindLabel = (kind: MenuLinkKind) => t(`kinds.${kind}`);

  return (
    <ActionForm
      action={saveMenu}
      submitLabel={t("save")}
      pendingLabel={t("saving")}
      hidden={{ storeId, menu, items: JSON.stringify(rows) }}
    >
      {(state) => (
        <div className="space-y-3">
          {rows.length === 0 ? <p className="text-sm text-muted-foreground">{t("empty")}</p> : null}
          <ol className="space-y-3">
            {rows.map((row, index) => {
              const prefix = `${menu}-${row.id}`;
              const invalid = state.field === `items.${index}`;
              const targeted = TARGETED_KINDS.includes(row.kind);
              const options = targeted ? targets[row.kind as keyof MenuTargetOptions] : [];
              return (
                <li
                  key={row.id}
                  className={`rounded-lg border p-3 ${invalid ? "border-destructive" : "border-border"}`}
                  aria-label={t("linkNumber", { position: index + 1 })}
                >
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,11rem)_minmax(0,1fr)_auto] md:items-end">
                    <div>
                      <Label htmlFor={`${prefix}-label`}>{t("label")}</Label>
                      <Input
                        id={`${prefix}-label`}
                        value={row.label}
                        maxLength={MENU_LIMITS.label}
                        onChange={(event) => update(index, { label: event.target.value })}
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <Label htmlFor={`${prefix}-kind`}>{t("linksTo")}</Label>
                      <Select
                        value={row.kind}
                        onValueChange={(kind) => update(index, { kind: kind as MenuLinkKind, targetId: null, url: null })}
                      >
                        <SelectTrigger id={`${prefix}-kind`} className="mt-1.5 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MENU_LINK_KINDS.map((kind) => (
                            <SelectItem key={kind} value={kind}>
                              {kindLabel(kind)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      {targeted ? (
                        <>
                          <Label htmlFor={`${prefix}-target`}>{kindLabel(row.kind)}</Label>
                          <Select value={row.targetId ?? ""} onValueChange={(targetId) => update(index, { targetId })}>
                            <SelectTrigger id={`${prefix}-target`} className="mt-1.5 w-full">
                              <SelectValue placeholder={t("choose")} />
                            </SelectTrigger>
                            <SelectContent>
                              {options.map((option) => (
                                <SelectItem key={option.id} value={option.id}>
                                  {option.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </>
                      ) : row.kind === "url" ? (
                        <>
                          <Label htmlFor={`${prefix}-url`}>{t("url")}</Label>
                          <Input
                            id={`${prefix}-url`}
                            value={row.url ?? ""}
                            placeholder="https://"
                            maxLength={MENU_LIMITS.url}
                            onChange={(event) => update(index, { url: event.target.value })}
                            className="mt-1.5"
                          />
                        </>
                      ) : null}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("moveUp")}
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUpIcon aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("moveDown")}
                        disabled={index === rows.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDownIcon aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("remove")}
                        onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                      >
                        <Trash2Icon aria-hidden />
                      </Button>
                    </div>
                  </div>
                  {languages.length > 0 ? (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs font-medium text-primary">{t("translateLabel")}</summary>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {languages.map((language) => (
                          <div key={language.code}>
                            <Label htmlFor={`${prefix}-${language.code}`} className="text-xs">
                              {language.name}
                            </Label>
                            <Input
                              id={`${prefix}-${language.code}`}
                              value={row.translations?.[language.code]?.label?.value ?? ""}
                              placeholder={row.label}
                              maxLength={MENU_LIMITS.label}
                              onChange={(event) => translate(index, language.code, event.target.value)}
                              className="mt-1"
                            />
                          </div>
                        ))}
                      </div>
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ol>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={rows.length >= MENU_LIMITS.items}
            onClick={() =>
              setRows((current) => [...current, { id: newId("mnu"), label: "", kind: "page", targetId: null, url: null }])
            }
          >
            <PlusIcon aria-hidden />
            {t("add")}
          </Button>
        </div>
      )}
    </ActionForm>
  );
}
