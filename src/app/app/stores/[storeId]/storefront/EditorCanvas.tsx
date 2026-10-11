"use client";

import { Editor, Frame, useEditor, useNode } from "@craftjs/core";
import { createTranslator, useLocale, useTranslations } from "next-intl";
import React, { createContext, useContext, useMemo, useState } from "react";
import { publishStorefront, saveStorefrontDraft } from "@/app/actions/storefront";
import type { ActionState } from "@/app/actions/stores";
import { translateMissing } from "@/app/actions/translations";
import { FormStatus } from "@/components/forms";
import { RenderSection, type StorefrontContext } from "@/components/sections";
import { Badge } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { languageName } from "@/i18n/display";
import { localeBase } from "@/i18n/storefront-routing";
import type { Locale } from "@/i18n/locales";
import { NAV_COLLECTIONS_PROP, navCollectionIds } from "@/lib/collections";
import { storeThemeStyle } from "@/lib/store-theme";
import { MAX_SHIP_DAYS, SHIP_DAYS_PROP, shipDays } from "@/lib/shipping-promise";
import { SECTION_DEFS, SECTION_ORDER, type SectionType } from "@/lib/storefront-schema";
import { summarizeSections, type SectionSummary } from "@/lib/storefront-versions";
import {
  I18N_PROP,
  localizeSectionProps,
  missingTreeFields,
  siteContent,
  SEO_FIELDS,
  SITE_FIELDS,
  translationOf,
  translationState,
  withTranslation,
  type FieldTranslations,
} from "@/lib/translations";
import { classNames, formatDateTime } from "@/lib/util";
import { ContentTranslations, StateBadge, type ItemUpdate, type TranslatableItem } from "./ContentTranslations";
import { ShopTextSheet, type ShopTextData } from "./ShopTextSheet";
import { VersionHistory, type HistoryEntry } from "./VersionHistory";

const Ctx = createContext<StorefrontContext | null>(null);
function useCtx() {
  const value = useContext(Ctx);
  if (!value) throw new Error("Storefront context missing");
  return value;
}

/** The language the editor is showing, and the store's default it falls back to. */
const LocaleCtx = createContext<{ locale: string; defaultLocale: string }>({ locale: "en", defaultLocale: "en" });
const useEditLocale = () => useContext(LocaleCtx);

/* ------------------------------------------------ craft-aware components */

function makeSection(type: SectionType) {
  const Component = (props: Record<string, unknown>) => {
    const ctx = useCtx();
    const { locale, defaultLocale } = useEditLocale();
    const {
      connectors: { connect, drag },
      selected,
      hovered,
    } = useNode((node) => ({
      selected: node.events.selected,
      hovered: node.events.hovered,
    }));

    return (
      <div
        ref={(ref) => {
          if (ref) connect(drag(ref));
        }}
        className={classNames("relative", selected ? "craft-selected" : hovered ? "craft-hover" : "")}
      >
        {selected ? (
          <span className="absolute left-2 top-2 z-10 rounded bg-brand-600 px-2 py-0.5 text-[11px] font-semibold text-white">
            {SECTION_DEFS[type].name}
          </span>
        ) : null}
        <RenderSection type={type} props={localizeSectionProps(type, props, locale, defaultLocale)} ctx={ctx} />
      </div>
    );
  };
  Component.craft = {
    displayName: SECTION_DEFS[type].name,
    props: SECTION_DEFS[type].defaults,
  };
  return Component;
}

const SECTION_COMPONENTS = Object.fromEntries(
  SECTION_ORDER.map((type) => [type, makeSection(type)]),
) as unknown as Record<SectionType, React.ComponentType<Record<string, unknown>>>;

function PageCanvas({ children }: { children?: React.ReactNode }) {
  const {
    connectors: { connect },
  } = useNode();
  return (
    <div
      ref={(ref) => {
        if (ref) connect(ref);
      }}
      className="min-h-[24rem] bg-white"
    >
      {children}
    </div>
  );
}
PageCanvas.craft = { displayName: "Page" };

const RESOLVER = { PageCanvas, ...SECTION_COMPONENTS };

/* ------------------------------------------------------------- toolbox */

function Toolbox() {
  const { connectors, actions, query } = useEditor();
  const t = useTranslations("editor");

  function append(type: SectionType) {
    const element = React.createElement(SECTION_COMPONENTS[type], { ...SECTION_DEFS[type].defaults });
    const nodeTree = query.parseReactElement(element).toNodeTree();
    actions.addNodeTree(nodeTree, "ROOT");
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle asChild className="text-sm font-semibold">
          <h2>{t("approvedSections")}</h2>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {t("dragHint")}
        </p>
      </CardHeader>
      <CardContent>
      <ul className="space-y-2">
        {SECTION_ORDER.map((type) => (
          <li
            key={type}
            ref={(ref) => {
              if (ref) {
                connectors.create(
                  ref,
                  React.createElement(SECTION_COMPONENTS[type], { ...SECTION_DEFS[type].defaults }),
                );
              }
            }}
            className="cursor-grab rounded-lg border border-border bg-background p-3 hover:border-primary/40"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{t(`sections.${type}.name`)}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{t(`sections.${type}.description`)}</p>
              </div>
              <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => append(type)}>
                {t("add")}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------- settings */

function SettingsPanel() {
  const { selectedId, sectionType, props, actions, canMoveUp, canMoveDown, index } = useEditor((state) => {
    const id = [...state.events.selected][0];
    const node = id ? state.nodes[id] : undefined;
    const rootChildren = state.nodes.ROOT?.data.nodes ?? [];
    const position = id ? rootChildren.indexOf(id) : -1;
    return {
      selectedId: id,
      sectionType: node?.data.name as SectionType | undefined,
      props: node?.data.props as Record<string, unknown> | undefined,
      canMoveUp: position > 0,
      canMoveDown: position >= 0 && position < rootChildren.length - 1,
      index: position,
    };
  });

  const def = sectionType && sectionType in SECTION_DEFS ? SECTION_DEFS[sectionType] : null;
  const collections = useCtx().collections ?? [];
  const t = useTranslations("editor");
  const { locale, defaultLocale } = useEditLocale();
  const isDefault = locale === defaultLocale;
  // Field and option labels in the reader's language; the schema's English is the fallback.
  const label = (key: string, fallback: string) =>
    t.has(key as "add") ? t(key as "add") : fallback;

  if (!selectedId || selectedId === "ROOT" || !props || !def) {
    return (
      <Card size="sm">
        <CardHeader>
          <CardTitle asChild className="text-sm font-semibold">
            <h2>{t("sectionSettings")}</h2>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {t("selectSection")}
          </p>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle asChild className="text-sm font-semibold">
          <h2>{t(`sections.${def.type}.name`)}</h2>
        </CardTitle>
        <CardAction className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!canMoveUp}
            onClick={() => actions.move(selectedId, "ROOT", index - 1)}
            aria-label={t("moveUp")}
          >
            ↑
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!canMoveDown}
            onClick={() => actions.move(selectedId, "ROOT", index + 2)}
            aria-label={t("moveDown")}
          >
            ↓
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-rose-700"
            onClick={() => actions.delete(selectedId)}
          >
            {t("delete")}
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent>
      {isDefault ? null : <p className="mb-3.5 text-xs text-muted-foreground">{t("sharedSettings")}</p>}
      <div className="space-y-3.5">
        {def.fields.map((field) => {
          const id = `field-${selectedId}-${field.key}`;
          const value = props[field.key];
          if (field.type === "text" || field.type === "textarea") {
            return (
              <CopyField
                key={field.key}
                nodeId={selectedId}
                fieldKey={field.key}
                label={label(`sections.${def.type}.fields.${field.key}`, field.label)}
                long={field.type === "textarea"}
                props={props}
              />
            );
          }
          if (field.type === "toggle") {
            return (
              <div key={field.key} className="flex items-start gap-2.5">
                <Switch
                  id={id}
                  disabled={!isDefault}
                  checked={value !== false}
                  onCheckedChange={(checked) =>
                    actions.setProp(selectedId, (p: Record<string, unknown>) => {
                      p[field.key] = checked;
                    })
                  }
                  className="mt-0.5"
                />
                <Label htmlFor={id} className="cursor-pointer text-sm font-normal">
                  {label(`sections.${def.type}.fields.${field.key}`, field.label)}
                </Label>
              </div>
            );
          }
          return (
            <div key={field.key} className="grid gap-1.5">
              <Label htmlFor={id} className="text-xs">
                {label(`sections.${def.type}.fields.${field.key}`, field.label)}
              </Label>
              {field.type === "select" ? (
                <Select
                  disabled={!isDefault}
                  value={
                    field.key === "source" && !collections.some((c) => c.id === value)
                      ? String(field.options?.[0]?.value ?? "")
                      : String(value ?? "")
                  }
                  onValueChange={(next) =>
                    actions.setProp(selectedId, (p: Record<string, unknown>) => {
                      p[field.key] = next;
                    })
                  }
                >
                  <SelectTrigger id={id} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options?.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {label(`options.${option.value}`, option.label)}
                      </SelectItem>
                    ))}
                    {/* A Product grid can draw from any of the store's collections. */}
                    {field.key === "source"
                      ? collections.map((collection) => (
                          <SelectItem key={collection.id} value={collection.id}>
                            {collection.name}
                          </SelectItem>
                        ))
                      : null}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id={id}
                  disabled={!isDefault}
                  type={field.type === "number" ? "number" : "text"}
                  min={field.min}
                  max={field.max}
                  value={String(value ?? "")}
                  onChange={(e) => {
                    const raw = e.target.value;
                    actions.setProp(selectedId, (p: Record<string, unknown>) => {
                      p[field.key] = field.type === "number" ? Number(raw) : raw;
                    });
                  }}
                  className={field.type === "number" ? "tabular-nums" : undefined}
                />
              )}
              {field.help ? (
                <p className="text-xs text-muted-foreground">
                  {label(`sections.${def.type}.fields.${field.key}Help`, field.help)}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      </CardContent>
    </Card>
  );
}

/**
 * One piece of copy on a node. In the default language it edits the source;
 * in any other it edits that language's translation, with the source as the
 * placeholder and a badge while it is missing or machine-translated. Typing
 * is a person saving it, so the machine mark goes.
 */
function CopyField({
  nodeId,
  fieldKey,
  label,
  long,
  props,
}: {
  nodeId: string;
  fieldKey: string;
  label: string;
  long: boolean;
  props: Record<string, unknown>;
}) {
  const { actions } = useEditor();
  const { locale, defaultLocale } = useEditLocale();
  const isDefault = locale === defaultLocale;
  const source = String(props[fieldKey] ?? "");
  const translations = props[I18N_PROP] as FieldTranslations | undefined;
  const value = isDefault ? source : (translationOf(translations, locale, fieldKey)?.value ?? "");
  const id = `field-${nodeId}-${fieldKey}`;

  function change(next: string) {
    actions.setProp(nodeId, (p: Record<string, unknown>) => {
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
        <Textarea
          id={id}
          rows={3}
          value={value}
          placeholder={isDefault ? undefined : source}
          onChange={(e) => change(e.target.value)}
        />
      ) : (
        <Input
          id={id}
          value={value}
          placeholder={isDefault ? undefined : source}
          onChange={(e) => change(e.target.value)}
        />
      )}
    </div>
  );
}

/** A product or portal row after a save in the sheet. */
function applyUpdate(item: TranslatableItem, update: ItemUpdate): TranslatableItem {
  return {
    ...item,
    translations: update.translations ?? item.translations,
    fields: update.sources
      ? item.fields.map((f) => (f.key in update.sources! ? { ...f, source: update.sources![f.key] } : f))
      : item.fields,
  };
}

/** The store's search title and description, kept on the page's root node. */
function SeoPanel() {
  const props = useEditor((state) => ({ props: (state.nodes.ROOT?.data.props ?? {}) as Record<string, unknown> })).props;
  const t = useTranslations("editor.seo");

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle asChild className="text-sm font-semibold">
          <h2>{t("title")}</h2>
        </CardTitle>
        <p className="text-xs text-muted-foreground">{t("body")}</p>
      </CardHeader>
      <CardContent className="space-y-3.5">
        {SEO_FIELDS.map((field) => (
          <CopyField
            key={field.key}
            nodeId="ROOT"
            fieldKey={field.key}
            label={t(`fields.${field.key}`)}
            long={field.type === "textarea"}
            props={props}
          />
        ))}
      </CardContent>
    </Card>
  );
}

/** The announcement bar, navigation labels and footer note, kept on the page's root node. */
function SiteContentPanel() {
  const { props, actions } = useEditor((state) => ({
    props: (state.nodes.ROOT?.data.props ?? {}) as Record<string, unknown>,
  }));
  const t = useTranslations("editor.site");
  const { locale, defaultLocale } = useEditLocale();
  const collections = useCtx().collections ?? [];
  const linked = navCollectionIds({ ROOT: { props } });

  // The header lists the linked collections in the store's collection order.
  function toggle(id: string, on: boolean) {
    const next = collections.map((c) => c.id).filter((cid) => (cid === id ? on : linked.includes(cid)));
    actions.setProp("ROOT", (p: Record<string, unknown>) => {
      p[NAV_COLLECTIONS_PROP] = next;
    });
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle asChild className="text-sm font-semibold">
          <h2>{t("title")}</h2>
        </CardTitle>
        <p className="text-xs text-muted-foreground">{t("body")}</p>
      </CardHeader>
      <CardContent className="space-y-3.5">
        {SITE_FIELDS.map((field) => (
          <CopyField
            key={field.key}
            nodeId="ROOT"
            fieldKey={field.key}
            label={t(`fields.${field.key}`)}
            long={field.type === "textarea"}
            props={props}
          />
        ))}
        <div className="grid gap-1.5">
          <Label htmlFor="site-ship-days" className="text-xs">
            {t("shipDays")}
          </Label>
          <Input
            id="site-ship-days"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_SHIP_DAYS}
            className="h-8 w-24"
            disabled={locale !== defaultLocale}
            value={shipDays({ ROOT: { props } }) ?? ""}
            aria-describedby="site-ship-days-hint"
            onChange={(event) => {
              const value = event.currentTarget.value;
              actions.setProp("ROOT", (p: Record<string, unknown>) => {
                p[SHIP_DAYS_PROP] = value === "" ? null : Math.min(MAX_SHIP_DAYS, Math.max(1, Math.round(Number(value))));
              });
            }}
          />
          <p id="site-ship-days-hint" className="text-xs text-muted-foreground">
            {t("shipDaysHint")}
          </p>
        </div>
        <fieldset className="grid gap-2">
          <legend className="text-xs font-medium text-foreground">{t("navCollections")}</legend>
          {collections.length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">{t("noCollections")}</p>
          ) : (
            <ul className="mt-1 space-y-2">
              {collections.map((collection) => {
                const id = `nav-collection-${collection.id}`;
                return (
                  <li key={collection.id} className="flex items-center gap-2.5">
                    <Checkbox
                      id={id}
                      disabled={locale !== defaultLocale}
                      checked={linked.includes(collection.id)}
                      onCheckedChange={(checked) => toggle(collection.id, checked === true)}
                    />
                    <Label htmlFor={id} className="cursor-pointer text-sm font-normal">
                      {collection.name}
                    </Label>
                  </li>
                );
              })}
            </ul>
          )}
        </fieldset>
      </CardContent>
    </Card>
  );
}

/* --------------------------------------------------------------- layers */

function LayerList() {
  const { locale, defaultLocale } = useEditLocale();
  // The collector only gathers the nodes: Craft keeps the first collector it
  // is given, so anything that depends on the selected language is worked
  // out below, on every render.
  const { collected, actions, selectedId } = useEditor((state) => ({
    collected: (state.nodes.ROOT?.data.nodes ?? []).map((id) => ({
      id,
      type: state.nodes[id]?.data.name as SectionType | undefined,
      props: state.nodes[id]?.data.props as Record<string, unknown>,
    })),
    selectedId: [...state.events.selected][0],
  }));
  const nodes = collected.map(({ id, type, props }) => ({
    id,
    type,
    missing:
      locale !== defaultLocale && type && type in SECTION_DEFS
        ? Object.keys(
            missingTreeFields({ ROOT: { nodes: [id] }, [id]: { type: { resolvedName: type }, props } }, locale),
          ).length > 0
        : false,
  }));
  const t = useTranslations("editor");

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle asChild className="text-sm font-semibold">
          <h2>{t("pageOrder")}</h2>
        </CardTitle>
        {nodes.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("emptyPage")}</p>
        ) : null}
      </CardHeader>
      {nodes.length === 0 ? null : (
        <CardContent>
        <ol className="space-y-1.5">
          {nodes.map((node, i) => (
            <li key={node.id}>
              <button
                type="button"
                onClick={() => actions.selectNode(node.id)}
                className={classNames(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm",
                  node.id === selectedId
                    ? "bg-primary/10 font-medium text-foreground"
                    : "text-inksoft hover:bg-muted",
                )}
              >
                <span className="w-5 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                {node.type && node.type in SECTION_DEFS ? t(`sections.${node.type}.name`) : t("section")}
                {node.missing ? (
                  <span className="ml-auto">
                    <StateBadge state="missing" />
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ol>
        </CardContent>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------- toolbar */

const WIDTHS = [
  { key: "desktop", label: "desktop", width: "100%" },
  { key: "tablet", label: "tablet", width: "820px" },
  { key: "mobile", label: "phone", width: "390px" },
] as const;

export interface EditorCanvasProps {
  storeId: string;
  storeSlug: string;
  storeName: string;
  tree: Record<string, unknown>;
  /** The enabled languages, default first among equals in the store's order. */
  languages: Locale[];
  defaultLocale: Locale;
  initialLocale: Locale;
  /** The preview context per language: built-in section copy and product cards. */
  contexts: Record<string, StorefrontContext>;
  /** The built-in header labels per language, shown when a store leaves its own empty. */
  chrome: Record<string, SiteChrome>;
  products: TranslatableItem[];
  collections: TranslatableItem[];
  portals: TranslatableItem[];
  shopText: ShopTextData;
  publishedAt: string | null;
  publishedBy: string | null;
  draftUpdatedAt: string;
  history: HistoryEntry[];
  liveVersionId: string | null;
  liveSections: SectionSummary[] | null;
}

type ShellProps = EditorCanvasProps & {
  data: string;
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

/** The built-in header copy per language, shown when a store leaves its own empty. */
type SiteChrome = { shop: string; orderStatus: string; shipsWithin: string };

/** The canvas's header and footer, drawn from the root node's copy in the selected language. */
function SitePreview({ storeName, chrome, children }: { storeName: string; chrome: SiteChrome; children: React.ReactNode }) {
  const { locale, defaultLocale } = useEditLocale();
  const tree = useEditor((state) => ({ props: state.nodes.ROOT?.data.props ?? {} })).props;
  const site = siteContent({ ROOT: { props: tree } }, locale, defaultLocale);
  // Matches the storefront: an empty announcement shows the shipping time.
  const days = shipDays({ ROOT: { props: tree } });
  const announcement =
    site.announcement ||
    (days ? createTranslator({ locale: locale as Locale, messages: { shipsWithin: chrome.shipsWithin } })("shipsWithin", { days }) : "");
  const collections = useCtx().collections ?? [];
  const linked = navCollectionIds({ ROOT: { props: tree } });
  return (
    <>
      {announcement ? (
        <div className="bg-primary px-4 py-2 text-center text-sm text-primary-foreground">{announcement}</div>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-border px-4 py-3">
        <span className="font-heading text-base font-semibold tracking-tight text-foreground">{storeName}</span>
        <span className="text-sm font-medium text-foreground">{site.navShop || chrome.shop}</span>
        {collections
          .filter((c) => linked.includes(c.id))
          .map((c) => (
            <span key={c.id} className="text-sm font-medium text-foreground">
              {c.name}
            </span>
          ))}
        <span className="text-sm font-medium text-foreground">{site.navOrders || chrome.orderStatus}</span>
      </div>
      {children}
      <div className="border-t border-border bg-muted/60 px-4 py-6">
        <p className="font-heading text-sm font-semibold text-foreground">{storeName}</p>
        {site.footerNote ? (
          <p className="mt-2 text-sm whitespace-pre-line text-muted-foreground">{site.footerNote}</p>
        ) : null}
      </div>
    </>
  );
}

function EditorShell(props: ShellProps) {
  const { query, actions, pageTree } = useEditor((state) => ({
    pageTree: Object.fromEntries(
      Object.entries(state.nodes).map(([id, node]) => [
        id,
        { type: { resolvedName: node.data.name }, props: node.data.props, nodes: node.data.nodes },
      ]),
    ),
  }));
  // How much of the page has no translation in the selected language.
  const missingOnPage =
    props.locale === props.defaultLocale ? 0 : Object.keys(missingTreeFields(pageTree, props.locale)).length;
  const [device, setDevice] = useState<(typeof WIDTHS)[number]["key"]>("desktop");
  const [status, setStatus] = useState<ActionState>({ status: "idle" });
  const [busy, setBusy] = useState<"save" | "publish" | "translate" | null>(null);
  const [label, setLabel] = useState("");
  const [products, setProducts] = useState(props.products);
  const [portals, setPortals] = useState(props.portals);
  const [collections, setCollections] = useState(props.collections);
  const savedSections = useMemo(() => summarizeSections(props.tree), [props.tree]);
  const t = useTranslations("editor");
  const uiLocale = useLocale();
  const locale = props.locale;
  const isDefault = locale === props.defaultLocale;
  const languageLabel = (code: string) => languageName(uiLocale, code);

  const missingElsewhere = isDefault
    ? 0
    : [...products, ...collections, ...portals].reduce(
        (sum, item) =>
          sum +
          item.fields.filter(
            (f) => f.source.trim() !== "" && !translationOf(item.translations, locale, f.key),
          ).length,
        0,
      );
  const missing = missingOnPage + missingElsewhere;

  async function run(kind: "save" | "publish") {
    if (busy) return;
    setBusy(kind);
    setStatus({ status: "idle" });
    try {
      const data = new FormData();
      data.set("storeId", props.storeId);
      data.set("tree", query.serialize());
      data.set("locale", locale);
      data.set("label", label);
      const result =
        kind === "save"
          ? await saveStorefrontDraft({ status: "idle" }, data)
          : await publishStorefront({ status: "idle" }, data);
      setStatus(result);
    } catch {
      setStatus({ status: "error", message: t("saveFailed") });
    } finally {
      setBusy(null);
    }
  }

  async function translate() {
    if (busy) return;
    setBusy("translate");
    setStatus({ status: "idle" });
    try {
      const before = query.serialize();
      const result = await translateMissing({ storeId: props.storeId, locale, tree: before });
      if (result.tree) {
        const after = JSON.stringify(result.tree);
        if (after !== before) actions.deserialize(after);
      }
      if (result.products) {
        const updated = result.products;
        setProducts((list) => list.map((p) => (updated[p.id] ? { ...p, translations: updated[p.id] } : p)));
      }
      if (result.collections) {
        const updated = result.collections;
        setCollections((list) => list.map((c) => (updated[c.id] ? { ...c, translations: updated[c.id] } : c)));
      }
      if (result.catalogues) {
        const updated = result.catalogues;
        setPortals((list) => list.map((p) => (updated[p.id] ? { ...p, translations: updated[p.id] } : p)));
      }
      setStatus({ status: result.status, message: result.message });
    } catch {
      setStatus({ status: "error", message: t("translateFailed") });
    } finally {
      setBusy(null);
    }
  }

  const width = WIDTHS.find((w) => w.key === device)?.width ?? "100%";
  const context = props.contexts[locale] ?? props.contexts[props.defaultLocale];

  return (
    <Ctx.Provider value={context}>
    <div className="space-y-4">
      <Card size="sm">
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="editor-language" className="text-xs font-medium text-muted-foreground">
                {t("language")}
              </Label>
              <Select value={locale} onValueChange={(next) => props.setLocale(next as Locale)} disabled={busy !== null}>
                <SelectTrigger id="editor-language" className="min-w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {props.languages.map((code) => (
                    <SelectItem key={code} value={code}>
                      {code === props.defaultLocale
                        ? t("defaultLanguage", { language: languageLabel(code) })
                        : languageLabel(code)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">{t("previewWidth")}</span>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                spacing={0}
                aria-label={t("previewWidth")}
                value={device}
                // One width is always being previewed, so an empty value is
                // ignored rather than leaving the canvas unconstrained.
                onValueChange={(next) => next && setDevice(next as (typeof WIDTHS)[number]["key"])}
              >
                {WIDTHS.map((option) => (
                  <ToggleGroupItem key={option.key} value={option.key}>
                    {t(option.label)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor="version-label" className="sr-only">
              {t("versionName")}
            </Label>
            <Input
              id="version-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("versionPlaceholder")}
              className="w-56"
            />
            <Button type="button" variant="outline" onClick={() => run("save")} disabled={busy !== null}>
              {busy === "save" ? t("saving") : t("saveDraft")}
            </Button>
            <Button type="button" onClick={() => run("publish")} disabled={busy !== null}>
              {busy === "publish" ? t("publishing") : t("publish")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <FormStatus state={status} />

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <Badge tone={props.publishedAt ? "green" : "amber"}>
          {props.publishedAt ? t("publishedBy", { name: props.publishedBy ?? "" }) : t("neverPublished")}
        </Badge>
        <span>{t("draftSaved", { date: formatDateTime(props.draftUpdatedAt, uiLocale) })}</span>
        <a
          href={localeBase(`/s/${props.storeSlug}`, locale, props.defaultLocale)}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-primary hover:underline"
        >
          {t("openLive")}
        </a>
      </div>

      <Tabs defaultValue="page" className="gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="page" className="px-3">
              {t("tabs.page")}
            </TabsTrigger>
            <TabsTrigger value="products" className="px-3">
              {t("tabs.products")}
            </TabsTrigger>
            <TabsTrigger value="collections" className="px-3">
              {t("tabs.collections")}
            </TabsTrigger>
            <TabsTrigger value="portals" className="px-3">
              {t("tabs.portals")}
            </TabsTrigger>
          </TabsList>
          <div className="flex flex-wrap items-center gap-2">
            {isDefault ? null : missing > 0 ? (
              <Badge tone="amber">{t("missingCount", { count: missing })}</Badge>
            ) : (
              <Badge tone="green">{t("allTranslated")}</Badge>
            )}
            {isDefault ? null : (
              <Button type="button" variant="outline" onClick={translate} disabled={busy !== null || missing === 0}>
                {busy === "translate" ? t("translating") : t("translateMissing")}
              </Button>
            )}
            <ShopTextSheet
              key={locale}
              storeId={props.storeId}
              locale={locale}
              defaultLocale={props.defaultLocale}
              languageLabel={languageLabel(locale)}
              data={props.shopText}
            />
          </div>
        </div>

        {/* The page stays mounted while another tab is open: the canvas holds
            the unsaved draft, and unmounting it would throw that away. */}
        <TabsContent value="page" forceMount className="data-[state=inactive]:hidden">
          <div className="grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)_20rem]">
            <div className="space-y-4">
              <Toolbox />
              <LayerList />
              <SiteContentPanel />
              <SeoPanel />
            </div>

            <div className="relative overflow-x-auto rounded-xl border border-border bg-canvas p-3">
              {/* The canvas carries the store's own theme, mapped onto the same
                  shadcn variables the live storefront maps them onto, so what is
                  arranged here is drawn in the client's brand rather than in
                  Parcelith's. The base font size is reset too: the workspace reads
                  at 14px and a storefront at the browser's 16px. */}
              <div
                lang={locale}
                className="font-sans mx-auto overflow-hidden rounded-lg border border-border bg-background text-base transition-all"
                style={{ maxWidth: width, ...storeThemeStyle(context.theme) }}
              >
                <SitePreview storeName={props.storeName} chrome={props.chrome[locale] ?? props.chrome[props.defaultLocale]}>
                  <Frame data={props.data} />
                </SitePreview>
              </div>
            </div>

            <div className="space-y-4">
              <SettingsPanel />
              <VersionHistory
                storeId={props.storeId}
                history={props.history}
                liveVersionId={props.liveVersionId}
                liveSections={props.liveSections}
                savedSections={savedSections}
                canvasSections={summarizeSections(pageTree)}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="products">
          <ContentTranslations
            kind="product"
            storeId={props.storeId}
            locale={locale}
            defaultLocale={props.defaultLocale}
            languageLabel={languageLabel(locale)}
            sourceLabel={languageLabel(props.defaultLocale)}
            items={products}
            onSaved={(id, update) =>
              setProducts((list) => list.map((p) => (p.id === id ? applyUpdate(p, update) : p)))
            }
          />
        </TabsContent>
        <TabsContent value="collections">
          <ContentTranslations
            kind="collection"
            storeId={props.storeId}
            locale={locale}
            defaultLocale={props.defaultLocale}
            languageLabel={languageLabel(locale)}
            sourceLabel={languageLabel(props.defaultLocale)}
            items={collections}
            onSaved={(id, update) =>
              setCollections((list) => list.map((c) => (c.id === id ? applyUpdate(c, update) : c)))
            }
          />
        </TabsContent>
        <TabsContent value="portals">
          <ContentTranslations
            kind="portal"
            storeId={props.storeId}
            locale={locale}
            defaultLocale={props.defaultLocale}
            languageLabel={languageLabel(locale)}
            sourceLabel={languageLabel(props.defaultLocale)}
            items={portals}
            onSaved={(id, update) =>
              setPortals((list) => list.map((p) => (p.id === id ? applyUpdate(p, update) : p)))
            }
          />
        </TabsContent>
      </Tabs>
    </div>
    </Ctx.Provider>
  );
}

export default function EditorCanvas(props: EditorCanvasProps) {
  const data = useMemo(() => JSON.stringify(props.tree), [props.tree]);
  const [locale, setLocaleState] = useState<Locale>(props.initialLocale);

  // The address keeps the language, so a reload or a shared link opens the
  // editor where it was left.
  function setLocale(next: Locale) {
    setLocaleState(next);
    const url = new URL(window.location.href);
    if (next === props.defaultLocale) url.searchParams.delete("lang");
    else url.searchParams.set("lang", next);
    window.history.replaceState(window.history.state, "", url);
  }

  return (
    <LocaleCtx.Provider value={{ locale, defaultLocale: props.defaultLocale }}>
      <Editor resolver={RESOLVER} enabled>
        <EditorShell {...props} data={data} locale={locale} setLocale={setLocale} />
      </Editor>
    </LocaleCtx.Provider>
  );
}
