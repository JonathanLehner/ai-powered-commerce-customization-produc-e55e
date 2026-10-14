"use client";

import React, { useLayoutEffect, useRef, useState } from "react";

/** The widths the editor previews at. Desktop fills a wider column, never less than 1280px. */
export const PREVIEW_WIDTHS = [
  { key: "desktop", label: "desktop", width: 1280, fill: true },
  { key: "tablet", label: "tablet", width: 820, fill: false },
  { key: "mobile", label: "phone", width: 390, fill: false },
] as const;

export type PreviewWidth = (typeof PREVIEW_WIDTHS)[number];

/**
 * Lays the page out at the device's real width and scales it down to the
 * column it sits in, the way a theme editor does, so a desktop heading wraps
 * as it would on a desktop rather than once per word in a narrow column.
 */
export function PreviewFrame({ device, children }: { device: PreviewWidth; children: React.ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(0);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const box = outer.current;
    const page = inner.current;
    if (!box || !page) return;
    const measure = () => {
      setAvailable(box.clientWidth);
      setHeight(page.offsetHeight);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    observer.observe(page);
    return () => observer.disconnect();
  }, []);

  const width = device.fill ? Math.max(device.width, available) : device.width;
  const scale = available > 0 && available < width ? available / width : 1;

  return (
    <div ref={outer} className="overflow-hidden" style={scale < 1 ? { height: height * scale } : undefined}>
      <div
        ref={inner}
        className={scale < 1 ? "origin-top-left" : "mx-auto"}
        style={{ width, transform: scale < 1 ? `scale(${scale})` : undefined }}
      >
        {children}
      </div>
    </div>
  );
}
