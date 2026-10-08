"use client";

import { Editor, Frame, useEditor, useNode } from "@craftjs/core";
import React, { createContext, useContext, useMemo, useState } from "react";
import { publishStorefront, restoreVersion, saveStorefrontDraft } from "@/app/actions/storefront";
import type { ActionState } from "@/app/actions/stores";
import { FormStatus } from "@/components/forms";
import { RenderSection, type StorefrontContext } from "@/components/sections";
import { Badge } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SECTION_DEFS, SECTION_ORDER, type SectionType } from "@/lib/storefront-schema";
import { classNames, formatDateTime } from "@/lib/util";

const Ctx = createContext<StorefrontContext | null>(null);
function useCtx() {
  const value = useContext(Ctx);
  if (!value) throw new Error("Storefront context missing");
  return value;
}

/* ------------------------------------------------ craft-aware components */

function makeSection(type: SectionType) {
  const Component = (props: Record<string, unknown>) => {
    const ctx = useCtx();
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
        <RenderSection type={type} props={props} ctx={ctx} />
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

  function append(type: SectionType) {
    const element = React.createElement(SECTION_COMPONENTS[type], { ...SECTION_DEFS[type].defaults });
    const nodeTree = query.parseReactElement(element).toNodeTree();
    actions.addNodeTree(nodeTree, "ROOT");
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle asChild className="text-sm font-semibold">
          <h2>Approved sections</h2>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Drag a section onto the canvas, or use Add to append it to the bottom of the page.
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
                <p className="text-sm font-medium text-foreground">{SECTION_DEFS[type].name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{SECTION_DEFS[type].description}</p>
              </div>
              <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => append(type)}>
                Add
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

  if (!selectedId || selectedId === "ROOT" || !props || !def) {
    return (
      <Card size="sm">
        <CardHeader>
          <CardTitle asChild className="text-sm font-semibold">
            <h2>Section settings</h2>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Select a section on the canvas — or in the page order list — to edit its copy, imagery and layout.
          </p>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle asChild className="text-sm font-semibold">
          <h2>{def.name}</h2>
        </CardTitle>
        <CardAction className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!canMoveUp}
            onClick={() => actions.move(selectedId, "ROOT", index - 1)}
            aria-label="Move section up"
          >
            ↑
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!canMoveDown}
            onClick={() => actions.move(selectedId, "ROOT", index + 2)}
            aria-label="Move section down"
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
            Delete
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent>
      <div className="space-y-3.5">
        {def.fields.map((field) => {
          const id = `field-${selectedId}-${field.key}`;
          const value = props[field.key];
          if (field.type === "toggle") {
            return (
              <div key={field.key} className="flex items-start gap-2.5">
                <Switch
                  id={id}
                  checked={value !== false}
                  onCheckedChange={(checked) =>
                    actions.setProp(selectedId, (p: Record<string, unknown>) => {
                      p[field.key] = checked;
                    })
                  }
                  className="mt-0.5"
                />
                <Label htmlFor={id} className="cursor-pointer text-sm font-normal">
                  {field.label}
                </Label>
              </div>
            );
          }
          return (
            <div key={field.key} className="grid gap-1.5">
              <Label htmlFor={id} className="text-xs">
                {field.label}
              </Label>
              {field.type === "textarea" ? (
                <Textarea
                  id={id}
                  rows={3}
                  value={String(value ?? "")}
                  onChange={(e) => {
                    const next = e.target.value;
                    actions.setProp(selectedId, (p: Record<string, unknown>) => {
                      p[field.key] = next;
                    });
                  }}
                />
              ) : field.type === "select" ? (
                <Select
                  value={String(value ?? "")}
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
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id={id}
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
              {field.help ? <p className="text-xs text-muted-foreground">{field.help}</p> : null}
            </div>
          );
        })}
      </div>
      </CardContent>
    </Card>
  );
}

/* --------------------------------------------------------------- layers */

function LayerList() {
  const { nodes, actions, selectedId } = useEditor((state) => ({
    nodes: (state.nodes.ROOT?.data.nodes ?? []).map((id) => ({
      id,
      name: state.nodes[id]?.data.displayName ?? "Section",
    })),
    selectedId: [...state.events.selected][0],
  }));

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle asChild className="text-sm font-semibold">
          <h2>Page order</h2>
        </CardTitle>
        {nodes.length === 0 ? (
          <p className="text-xs text-muted-foreground">The page is empty. Add a section to begin.</p>
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
                {node.name}
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
  { key: "desktop", label: "Desktop", width: "100%" },
  { key: "tablet", label: "Tablet", width: "820px" },
  { key: "mobile", label: "Phone", width: "390px" },
] as const;

export interface EditorCanvasProps {
  storeId: string;
  storeSlug: string;
  tree: Record<string, unknown>;
  context: StorefrontContext;
  publishedAt: string | null;
  publishedBy: string | null;
  draftUpdatedAt: string;
  history: { id: string; label: string; savedAt: string; savedBy: string }[];
}

function EditorShell(props: EditorCanvasProps & { data: string }) {
  const { query } = useEditor();
  const [device, setDevice] = useState<(typeof WIDTHS)[number]["key"]>("desktop");
  const [status, setStatus] = useState<ActionState>({ status: "idle" });
  const [busy, setBusy] = useState<"save" | "publish" | null>(null);
  const [label, setLabel] = useState("");

  async function run(kind: "save" | "publish") {
    if (busy) return;
    setBusy(kind);
    setStatus({ status: "idle" });
    try {
      const data = new FormData();
      data.set("storeId", props.storeId);
      data.set("tree", query.serialize());
      if (kind === "publish") data.set("label", label || "Untitled version");
      const result =
        kind === "save"
          ? await saveStorefrontDraft({ status: "idle" }, data)
          : await publishStorefront({ status: "idle" }, data);
      setStatus(result);
    } catch {
      setStatus({ status: "error", message: "Something went wrong saving the layout. Try again." });
    } finally {
      setBusy(null);
    }
  }

  const width = WIDTHS.find((w) => w.key === device)?.width ?? "100%";

  return (
    <div className="space-y-4">
      <Card size="sm">
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Preview width</span>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              spacing={0}
              aria-label="Preview width"
              value={device}
              // One width is always being previewed, so an empty value is
              // ignored rather than leaving the canvas unconstrained.
              onValueChange={(next) => next && setDevice(next as (typeof WIDTHS)[number]["key"])}
            >
              {WIDTHS.map((option) => (
                <ToggleGroupItem key={option.key} value={option.key}>
                  {option.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor="version-label" className="sr-only">
              Version name
            </Label>
            <Input
              id="version-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Version name, e.g. Autumn range"
              className="w-56"
            />
            <Button type="button" variant="outline" onClick={() => run("save")} disabled={busy !== null}>
              {busy === "save" ? "Saving…" : "Save draft"}
            </Button>
            <Button type="button" onClick={() => run("publish")} disabled={busy !== null}>
              {busy === "publish" ? "Publishing…" : "Publish"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <FormStatus state={status} />

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <Badge tone={props.publishedAt ? "green" : "amber"}>
          {props.publishedAt ? `Published by ${props.publishedBy}` : "Never published"}
        </Badge>
        <span>Draft last saved {formatDateTime(props.draftUpdatedAt)}</span>
        <a
          href={`/s/${props.storeSlug}`}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-primary hover:underline"
        >
          Open live storefront ↗
        </a>
      </div>

      <div className="grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <Toolbox />
          <LayerList />
        </div>

        <div className="relative overflow-x-auto rounded-xl border border-border bg-canvas p-3">
          <div
            className="mx-auto overflow-hidden rounded-lg border border-border bg-background transition-all"
            style={{ maxWidth: width }}
          >
            <Frame data={props.data} />
          </div>
        </div>

        <div className="space-y-4">
          <SettingsPanel />
          {props.history.length > 0 ? (
            <Card size="sm">
              <CardHeader>
                <CardTitle asChild className="text-sm font-semibold">
                  <h2>Version history</h2>
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Restoring loads a version into the draft. It only goes live when you publish.
                </p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {props.history.map((version) => (
                    <li key={version.id} className="rounded-lg border border-border p-3">
                      <p className="font-medium text-foreground">{version.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {version.savedBy} · {formatDateTime(version.savedAt)}
                      </p>
                      <form action={restoreVersion} className="mt-2">
                        <input type="hidden" name="storeId" value={props.storeId} />
                        <input type="hidden" name="versionId" value={version.id} />
                        <Button type="submit" variant="outline" size="sm">
                          Restore into draft
                        </Button>
                      </form>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function EditorCanvas(props: EditorCanvasProps) {
  const data = useMemo(() => JSON.stringify(props.tree), [props.tree]);

  return (
    <Ctx.Provider value={props.context}>
      <Editor resolver={RESOLVER} enabled>
        <EditorShell {...props} data={data} />
      </Editor>
    </Ctx.Provider>
  );
}
