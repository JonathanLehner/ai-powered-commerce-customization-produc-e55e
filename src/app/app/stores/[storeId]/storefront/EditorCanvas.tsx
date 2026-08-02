"use client";

import { Editor, Frame, useEditor, useNode } from "@craftjs/core";
import React, { createContext, useContext, useMemo, useState } from "react";
import { publishStorefront, restoreVersion, saveStorefrontDraft } from "@/app/actions/storefront";
import type { ActionState } from "@/app/actions/stores";
import { FormStatus } from "@/components/forms";
import { RenderSection, type StorefrontContext } from "@/components/sections";
import { Badge } from "@/components/ui";
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
    <div className="card p-4">
      <h2 className="text-sm font-semibold text-ink">Approved sections</h2>
      <p className="mt-1 text-xs text-muted">
        Drag a section onto the canvas, or use Add to append it to the bottom of the page.
      </p>
      <ul className="mt-3 space-y-2">
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
            className="cursor-grab rounded-lg border border-line bg-white p-3 hover:border-brand-300"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{SECTION_DEFS[type].name}</p>
                <p className="mt-0.5 text-xs text-muted">{SECTION_DEFS[type].description}</p>
              </div>
              <button type="button" className="btn-secondary btn-sm shrink-0" onClick={() => append(type)}>
                Add
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
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
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-ink">Section settings</h2>
        <p className="mt-1.5 text-xs text-muted">
          Select a section on the canvas — or in the page order list — to edit its copy, imagery and layout.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">{def.name}</h2>
        <div className="flex gap-1">
          <button
            type="button"
            className="btn-ghost btn-sm"
            disabled={!canMoveUp}
            onClick={() => actions.move(selectedId, "ROOT", index - 1)}
            aria-label="Move section up"
          >
            ↑
          </button>
          <button
            type="button"
            className="btn-ghost btn-sm"
            disabled={!canMoveDown}
            onClick={() => actions.move(selectedId, "ROOT", index + 2)}
            aria-label="Move section down"
          >
            ↓
          </button>
          <button
            type="button"
            className="btn-ghost btn-sm text-rose-700"
            onClick={() => actions.delete(selectedId)}
          >
            Delete
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-3.5">
        {def.fields.map((field) => {
          const id = `field-${selectedId}-${field.key}`;
          const value = props[field.key];
          if (field.type === "toggle") {
            return (
              <label key={field.key} className="flex cursor-pointer items-start gap-2.5">
                <input
                  id={id}
                  type="checkbox"
                  checked={value !== false}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    actions.setProp(selectedId, (p: Record<string, unknown>) => {
                      p[field.key] = checked;
                    });
                  }}
                  className="mt-0.5 h-4 w-4 accent-brand-600"
                />
                <span className="text-sm text-ink">{field.label}</span>
              </label>
            );
          }
          return (
            <div key={field.key}>
              <label htmlFor={id} className="field-label text-xs">
                {field.label}
              </label>
              {field.type === "textarea" ? (
                <textarea
                  id={id}
                  rows={3}
                  value={String(value ?? "")}
                  onChange={(e) => {
                    const next = e.target.value;
                    actions.setProp(selectedId, (p: Record<string, unknown>) => {
                      p[field.key] = next;
                    });
                  }}
                  className="input py-1.5 text-sm"
                />
              ) : field.type === "select" ? (
                <select
                  id={id}
                  value={String(value ?? "")}
                  onChange={(e) => {
                    const next = e.target.value;
                    actions.setProp(selectedId, (p: Record<string, unknown>) => {
                      p[field.key] = next;
                    });
                  }}
                  className="input py-1.5 text-sm"
                >
                  {field.options?.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
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
                  className="input py-1.5 text-sm"
                />
              )}
              {field.help ? <p className="field-hint">{field.help}</p> : null}
            </div>
          );
        })}
      </div>
    </div>
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
    <div className="card p-4">
      <h2 className="text-sm font-semibold text-ink">Page order</h2>
      {nodes.length === 0 ? (
        <p className="mt-1.5 text-xs text-muted">The page is empty. Add a section to begin.</p>
      ) : (
        <ol className="mt-3 space-y-1.5">
          {nodes.map((node, i) => (
            <li key={node.id}>
              <button
                type="button"
                onClick={() => actions.selectNode(node.id)}
                className={classNames(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm",
                  node.id === selectedId ? "bg-brand-50 font-medium text-brand-800" : "text-inksoft hover:bg-canvas",
                )}
              >
                <span className="w-5 text-xs tabular-nums text-muted">{i + 1}</span>
                {node.name}
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
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
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted">Preview width</span>
          <div role="group" aria-label="Preview width" className="flex rounded-lg border border-line p-0.5">
            {WIDTHS.map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={device === option.key}
                onClick={() => setDevice(option.key)}
                className={classNames(
                  "rounded-md px-3 py-1.5 text-xs font-medium",
                  device === option.key ? "bg-brand-600 text-white" : "text-inksoft hover:bg-canvas",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="version-label" className="sr-only">
            Version name
          </label>
          <input
            id="version-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Version name, e.g. Autumn range"
            className="input mt-0 w-56 py-1.5 text-sm"
          />
          <button type="button" className="btn-secondary" onClick={() => run("save")} disabled={busy !== null}>
            {busy === "save" ? "Saving…" : "Save draft"}
          </button>
          <button type="button" className="btn-primary" onClick={() => run("publish")} disabled={busy !== null}>
            {busy === "publish" ? "Publishing…" : "Publish"}
          </button>
        </div>
      </div>

      <FormStatus state={status} />

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
        <Badge tone={props.publishedAt ? "green" : "amber"}>
          {props.publishedAt ? `Published by ${props.publishedBy}` : "Never published"}
        </Badge>
        <span>Draft last saved {formatDateTime(props.draftUpdatedAt)}</span>
        <a
          href={`/s/${props.storeSlug}`}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-brand-700 hover:underline"
        >
          Open live storefront ↗
        </a>
      </div>

      <div className="grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <Toolbox />
          <LayerList />
        </div>

        <div className="relative overflow-x-auto rounded-xl border border-line bg-canvas p-3">
          <div
            className="mx-auto overflow-hidden rounded-lg border border-line bg-white transition-all"
            style={{ maxWidth: width }}
          >
            <Frame data={props.data} />
          </div>
        </div>

        <div className="space-y-4">
          <SettingsPanel />
          {props.history.length > 0 ? (
            <div className="card p-4">
              <h2 className="text-sm font-semibold text-ink">Version history</h2>
              <p className="mt-1 text-xs text-muted">
                Restoring loads a version into the draft. It only goes live when you publish.
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                {props.history.map((version) => (
                  <li key={version.id} className="rounded-lg border border-line p-3">
                    <p className="font-medium text-ink">{version.label}</p>
                    <p className="text-xs text-muted">
                      {version.savedBy} · {formatDateTime(version.savedAt)}
                    </p>
                    <form action={restoreVersion} className="mt-2">
                      <input type="hidden" name="storeId" value={props.storeId} />
                      <input type="hidden" name="versionId" value={version.id} />
                      <button type="submit" className="btn-secondary btn-sm">
                        Restore into draft
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
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
