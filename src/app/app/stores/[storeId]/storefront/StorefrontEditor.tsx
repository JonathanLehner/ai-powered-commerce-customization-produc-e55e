"use client";

import dynamic from "next/dynamic";
import type { EditorCanvasProps } from "./EditorCanvas";

/** Craft.js is browser-only, so the canvas is loaded client-side. */
const EditorCanvas = dynamic(() => import("./EditorCanvas"), {
  ssr: false,
  loading: () => (
    <div className="rounded-xl border border-line bg-white p-10 text-center text-sm text-muted">
      Loading the storefront editor…
    </div>
  ),
});

export function StorefrontEditor(props: EditorCanvasProps) {
  return <EditorCanvas {...props} />;
}
