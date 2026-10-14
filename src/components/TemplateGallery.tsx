"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export interface GalleryTemplate {
  id: string;
  category: string;
  name: string;
  description: string;
  styles: string[];
  image: string;
  imageSrcSet?: string;
  colors: string[];
  fonts: string;
  /** The template's page, and its live demo. */
  href: string;
  demoHref: string;
}

/**
 * The template gallery: every template as a card, narrowed by category and
 * style on the page itself, so the page stays prerendered. Used on the
 * marketing site; the workspace's pickers use the same cards.
 */
export function TemplateGallery({
  templates,
  categories,
  styles,
  labels,
  initialCategory = "all",
  onPick,
  pickLabel,
}: {
  templates: GalleryTemplate[];
  categories: { key: string; label: string }[];
  styles: { key: string; label: string }[];
  labels: { all: string; allStyles: string; category: string; style: string; preview: string; details: string; none: string };
  initialCategory?: string;
  /** In the workspace: choose the template instead of opening its page. */
  onPick?: (id: string) => void;
  pickLabel?: string;
}) {
  const [category, setCategory] = useState(initialCategory);
  const [style, setStyle] = useState("all");
  const shown = templates.filter((t) => (category === "all" || t.category === category) && (style === "all" || t.styles.includes(style)));
  const categoryName = Object.fromEntries(categories.map((c) => [c.key, c.label]));
  const styleName = Object.fromEntries(styles.map((s) => [s.key, s.label]));

  const pill = (active: boolean) =>
    cn(
      "inline-flex h-9 shrink-0 items-center rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors",
      active ? "border-foreground bg-foreground text-background" : "border-border bg-background text-foreground hover:border-foreground/40",
    );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label={labels.category}
          className="flex w-full gap-2 overflow-x-auto pb-1 sm:w-auto sm:flex-wrap sm:overflow-visible sm:pb-0"
        >
          {[{ key: "all", label: labels.all }, ...categories].map((c) => (
            <button key={c.key} type="button" aria-pressed={category === c.key} onClick={() => setCategory(c.key)} className={pill(category === c.key)}>
              {c.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          {labels.style}
          <select
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            className="h-9 rounded-lg border border-input bg-background px-2 text-sm text-foreground"
          >
            <option value="all">{labels.allStyles}</option>
            {styles.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="mt-10 text-sm text-muted-foreground">{labels.none}</p>
      ) : (
        <ul className="mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((t, index) => (
            <li key={t.id} className="group flex flex-col">
              <a
                href={onPick ? t.demoHref : t.href}
                target={onPick ? "_blank" : undefined}
                rel={onPick ? "noreferrer" : undefined}
                className="block overflow-hidden rounded-xl border border-border bg-muted"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={t.image}
                  srcSet={t.imageSrcSet}
                  sizes="(min-width: 1024px) 360px, (min-width: 640px) 45vw, 92vw"
                  alt=""
                  width={1024}
                  height={768}
                  loading={index < 3 ? "eager" : "lazy"}
                  className="aspect-[4/3] w-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.02]"
                />
              </a>
              <div className="mt-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{categoryName[t.category]}</p>
                  <h3 className="mt-1 text-lg font-semibold tracking-tight text-foreground">{t.name}</h3>
                </div>
                <span className="mt-1 flex shrink-0 -space-x-1" aria-hidden>
                  {t.colors.map((c) => (
                    <span key={c} className="size-5 rounded-full border border-black/10" style={{ background: c }} />
                  ))}
                </span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t.description}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {t.styles.map((s) => styleName[s]).join(" · ")} · {t.fonts}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {onPick ? (
                  <button type="button" onClick={() => onPick(t.id)} className="inline-flex h-9 items-center rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                    {pickLabel}
                  </button>
                ) : (
                  <a href={t.href} className="inline-flex h-9 items-center rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                    {labels.details}
                  </a>
                )}
                <a
                  href={t.demoHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center rounded-lg border border-border px-3.5 text-sm font-medium text-foreground hover:bg-muted"
                >
                  {labels.preview}
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
