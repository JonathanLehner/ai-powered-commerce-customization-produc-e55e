"use client";

import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { Children, useActionState, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { addToCart, subscribeNewsletter, type AddToCartState } from "@/app/actions/shop";
import type { ActionState } from "@/app/actions/stores";
import { useBasketIfAny } from "@/components/BasketSheet";
import { cn } from "@/lib/utils";

/**
 * The storefront's few interactive pieces. Each is small, works from what the
 * server rendered, and stops moving for a shopper who asked for reduced motion.
 */

const REDUCED = "(prefers-reduced-motion: reduce)";

function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (change) => {
      const query = window.matchMedia(REDUCED);
      query.addEventListener("change", change);
      return () => query.removeEventListener("change", change);
    },
    () => window.matchMedia(REDUCED).matches,
    () => false,
  );
}

const ARROW =
  "inline-flex size-10 items-center justify-center rounded-full border border-border bg-background text-foreground transition-colors hover:border-foreground disabled:pointer-events-none disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/* --------------------------------------------------------------- carousel */

/**
 * A row that scrolls sideways by swipe, trackpad or its arrows. The items are
 * server-rendered list items; this only adds the arrows and knows when an end
 * has been reached.
 */
export function Carousel({
  label,
  previous,
  next,
  children,
  className,
  controls = "bottom",
}: {
  label: string;
  previous: string;
  next: string;
  children: ReactNode;
  className?: string;
  controls?: "bottom" | "top" | "none";
}) {
  const track = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft >= max - 4 });
  }, []);

  useEffect(() => {
    measure();
    const el = track.current;
    if (!el) return;
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      el.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  function go(direction: 1 | -1) {
    const el = track.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: reduce ? "auto" : "smooth" });
  }

  const arrows =
    controls === "none" || (edges.start && edges.end) ? null : (
      <div className={cn("flex gap-2", controls === "bottom" ? "mt-6 justify-end" : "")}>
        <button type="button" className={ARROW} onClick={() => go(-1)} disabled={edges.start} aria-label={previous}>
          <ChevronLeft aria-hidden className="size-5" />
        </button>
        <button type="button" className={ARROW} onClick={() => go(1)} disabled={edges.end} aria-label={next}>
          <ChevronRight aria-hidden className="size-5" />
        </button>
      </div>
    );

  return (
    <div role="region" aria-roledescription="carousel" aria-label={label} className={className}>
      {controls === "top" ? <div className="mb-4 flex justify-end">{arrows}</div> : null}
      <ul
        ref={track}
        className="no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:gap-5"
      >
        {children}
      </ul>
      {controls === "bottom" ? arrows : null}
    </div>
  );
}

/* -------------------------------------------------------------- slideshow */

/**
 * Full-width slides. It advances on its own only when asked to, never for a
 * shopper who prefers reduced motion, pauses while hovered or focused, and has
 * a pause button, so nothing moves that cannot be stopped.
 */
export function SlideshowFrame({
  children,
  autoplay,
  label,
  labels,
}: {
  children: ReactNode;
  autoplay: boolean;
  label: string;
  labels: { previous: string; next: string; pause: string; play: string; slide: string };
}) {
  const slides = Children.toArray(children);
  const count = slides.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const reduced = useReducedMotion();
  const running = autoplay && !reduced && !paused && !held && count > 1;

  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => setIndex((i) => (i + 1) % count), 6500);
    return () => window.clearTimeout(timer);
  }, [running, index, count]);

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      className="relative overflow-hidden"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <div
        className="sf-motion flex transition-transform duration-700 ease-out"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {slides.map((slide, i) => (
          <div
            key={i}
            role="group"
            aria-roledescription="slide"
            aria-label={labels.slide.replace("{n}", String(i + 1)).replace("{total}", String(count))}
            aria-hidden={i !== index}
            inert={i !== index}
            className="w-full shrink-0"
          >
            {slide}
          </div>
        ))}
      </div>
      {count > 1 ? (
        <div className="absolute right-4 bottom-4 z-10 flex items-center gap-2 sm:right-6 sm:bottom-6">
          {autoplay ? (
            <button
              type="button"
              className={cn(ARROW, "size-9 border-white/50 bg-black/35 text-white hover:border-white")}
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? labels.play : labels.pause}
            >
              {paused ? <Play aria-hidden className="size-4" /> : <Pause aria-hidden className="size-4" />}
            </button>
          ) : null}
          <button
            type="button"
            className={cn(ARROW, "size-9 border-white/50 bg-black/35 text-white hover:border-white")}
            onClick={() => setIndex((i) => (i - 1 + count) % count)}
            aria-label={labels.previous}
          >
            <ChevronLeft aria-hidden className="size-4" />
          </button>
          <button
            type="button"
            className={cn(ARROW, "size-9 border-white/50 bg-black/35 text-white hover:border-white")}
            onClick={() => setIndex((i) => (i + 1) % count)}
            aria-label={labels.next}
          >
            <ChevronRight aria-hidden className="size-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------- countdown */

function remaining(target: number) {
  const left = Math.max(0, target - Date.now());
  return {
    done: left === 0,
    days: Math.floor(left / 86_400_000),
    hours: Math.floor(left / 3_600_000) % 24,
    minutes: Math.floor(left / 60_000) % 60,
    seconds: Math.floor(left / 1000) % 60,
  };
}

/**
 * Days, hours, minutes and seconds to `endsAt`. The server sends dashes, so
 * the page never shows a time that was already wrong when it arrived; the
 * clock stops itself at zero.
 */
export function CountdownClock({
  endsAt,
  ended,
  units,
  compact = false,
  prefix = "",
  className,
}: {
  endsAt: string;
  ended: string;
  /** Shown before a compact clock, and hidden with it once the time has passed. */
  prefix?: string;
  units: { days: string; hours: string; minutes: string; seconds: string };
  compact?: boolean;
  className?: string;
}) {
  const target = Date.parse(endsAt);
  const [left, setLeft] = useState<ReturnType<typeof remaining> | null>(null);

  useEffect(() => {
    if (!Number.isFinite(target)) return;
    const tick = () => {
      const next = remaining(target);
      setLeft(next);
      if (next.done) window.clearInterval(timer);
    };
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [target]);

  if (!Number.isFinite(target)) return null;
  if (left?.done && compact) return null;
  if (left?.done) return <p className={cn("font-heading font-semibold", className)}>{ended}</p>;
  const pad = (n: number | undefined) => (n === undefined ? "--" : String(n).padStart(2, "0"));
  const parts: [string, number | undefined][] = [
    [units.days, left?.days],
    [units.hours, left?.hours],
    [units.minutes, left?.minutes],
    [units.seconds, left?.seconds],
  ];
  if (compact) {
    return (
      <span className={cn("font-semibold tabular-nums", className)} role="timer" aria-live="off">
        {prefix}
        {parts.map(([unit, value]) => `${pad(value)}${unit.slice(0, 1)}`).join(" ")}
      </span>
    );
  }
  return (
    <div role="timer" aria-live="off" className={cn("flex gap-2 sm:gap-3", className)}>
      {parts.map(([unit, value]) => (
        <div key={unit} className="min-w-16 rounded-[var(--radius)] border border-border bg-background/10 px-3 py-2.5 text-center sm:min-w-20">
          <span className="font-heading block text-3xl font-semibold tabular-nums sm:text-4xl">{pad(value)}</span>
          <span className="mt-1 block text-[11px] font-medium tracking-[0.12em] uppercase opacity-80">{unit}</span>
        </div>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------- announcement */

/**
 * The bar above the header. More than one message rotates, slowly, and stops
 * while hovered or focused or for reduced motion; arrows step through them.
 */
export function AnnouncementBar({
  messages,
  countdown,
  labels,
}: {
  messages: string[];
  countdown: { endsAt: string; units: { days: string; hours: string; minutes: string; seconds: string } } | null;
  labels: { previous: string; next: string };
}) {
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  const reduced = useReducedMotion();
  const count = messages.length;

  useEffect(() => {
    if (count < 2 || held || reduced) return;
    const timer = window.setTimeout(() => setIndex((i) => (i + 1) % count), 5000);
    return () => window.clearTimeout(timer);
  }, [count, held, reduced, index]);

  return (
    <div
      className="flex min-h-9 items-center justify-center gap-3 bg-primary px-4 py-2 text-center text-[13px] font-medium tracking-wide text-primary-foreground"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      {count > 1 ? (
        <button type="button" className="rounded p-0.5 opacity-80 hover:opacity-100" onClick={() => setIndex((i) => (i - 1 + count) % count)} aria-label={labels.previous}>
          <ChevronLeft aria-hidden className="size-4" />
        </button>
      ) : null}
      <p className="min-w-0">
        {messages[index] ?? ""}
        {countdown ? (
          <>
            <CountdownClock endsAt={countdown.endsAt} ended="" units={countdown.units} compact prefix={messages.length > 0 ? " · " : ""} />
          </>
        ) : null}
      </p>
      {count > 1 ? (
        <button type="button" className="rounded p-0.5 opacity-80 hover:opacity-100" onClick={() => setIndex((i) => (i + 1) % count)} aria-label={labels.next}>
          <ChevronRight aria-hidden className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------- quick add */

/**
 * Adds a product to the basket from its card. One option goes straight in;
 * more open a row of sizes. The button locks as soon as it is pressed, and
 * the line is named before posting, so a double click adds it once.
 */
export function QuickAdd({
  storeId,
  productId,
  variants,
  labels,
  inert = false,
  expanded = false,
}: {
  storeId: string;
  productId: string;
  variants: { id: string; label: string; soldOut: boolean }[];
  labels: { add: string; choose: string; added: string; soldOut: string };
  inert?: boolean;
  /** Shows the options straight away rather than behind the button. */
  expanded?: boolean;
}) {
  const basket = useBasketIfAny();
  const [open, setOpen] = useState(expanded);
  // Named once per add and kept until it lands, so a retry finds the same line.
  const lineId = useRef<string | null>(null);
  const [state, action, pending] = useActionState<AddToCartState, FormData>(async (previous, formData) => {
    const result = await addToCart(previous, formData);
    if (result.status === "success") {
      lineId.current = null;
      if (result.basket && basket) {
        basket.showSaved(result.basket);
        basket.setOpen(true);
        setOpen(expanded);
      }
    }
    return result;
  }, { status: "idle" });
  const sellable = variants.filter((v) => !v.soldOut);

  if (sellable.length === 0) return null;
  const single = variants.length === 1;

  function post(formData: FormData) {
    lineId.current ??= `ln_${Math.random().toString(36).slice(2, 12)}`;
    formData.set("lineId", `${lineId.current}_${formData.get("variantId")}`);
    action(formData);
  }

  const submit = (variantId: string) => (
    <form action={post} key={variantId} className="contents">
      <input type="hidden" name="storeId" value={storeId} />
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="variantId" value={variantId} />
      <button
        type="submit"
        disabled={pending || inert}
        className={cn(
          single
            ? "sf-btn sf-btn-secondary min-h-10 w-full text-[13px]"
            : "min-h-9 min-w-10 rounded-[var(--radius)] border border-border bg-background px-2.5 text-xs font-semibold text-foreground hover:border-foreground disabled:opacity-40",
        )}
      >
        {single ? labels.add : variants.find((v) => v.id === variantId)?.label}
      </button>
    </form>
  );

  return (
    <div className="mt-3">
      {single ? (
        submit(sellable[0].id)
      ) : open ? (
        <div role="group" aria-label={labels.choose} className="flex flex-wrap gap-1.5">
          {variants.map((v) =>
            v.soldOut ? (
              <span key={v.id} className="inline-flex min-h-9 min-w-10 items-center justify-center rounded-[var(--radius)] border border-dashed border-border px-2.5 text-xs text-muted-foreground line-through" title={labels.soldOut}>
                {v.label}
              </span>
            ) : (
              submit(v.id)
            ),
          )}
        </div>
      ) : (
        <button type="button" disabled={inert} onClick={() => setOpen(true)} className="sf-btn sf-btn-secondary min-h-10 w-full text-[13px]" aria-expanded={false}>
          {labels.add}
        </button>
      )}
      {state.status === "error" ? <p role="alert" className="mt-1.5 text-xs text-destructive">{state.message}</p> : null}
      {state.status === "success" && !basket ? <p className="mt-1.5 text-xs text-muted-foreground">{labels.added}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ video */

function embedUrl(url: string): string | null {
  const youtube = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/.exec(url);
  if (youtube) return `https://www.youtube-nocookie.com/embed/${youtube[1]}?autoplay=1&rel=0`;
  const vimeo = /vimeo\.com\/(?:video\/)?(\d+)/.exec(url);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}?autoplay=1`;
  return null;
}

/**
 * A video that loads nothing until it is played: the cover image and a play
 * button, then the file or the YouTube or Vimeo player. A looping background
 * video starts muted unless motion is reduced, and can be paused.
 */
export function VideoPlayer({
  url,
  poster,
  title,
  loop,
  labels,
  inert = false,
}: {
  url: string;
  poster: ReactNode;
  title: string;
  loop: boolean;
  labels: { play: string; pause: string };
  inert?: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const reduced = useReducedMotion();
  const video = useRef<HTMLVideoElement>(null);
  const embed = embedUrl(url);

  if (loop && !embed) {
    return (
      <div className="relative h-full w-full">
        <video
          ref={video}
          className="h-full w-full object-cover"
          src={url}
          muted
          loop
          playsInline
          autoPlay={!reduced && !inert}
          preload="metadata"
          aria-label={title}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        />
        <button
          type="button"
          className={cn(ARROW, "absolute right-4 bottom-4 size-9 border-white/50 bg-black/40 text-white")}
          onClick={() => (video.current?.paused ? video.current.play() : video.current?.pause())}
          aria-label={playing ? labels.pause : labels.play}
        >
          {playing ? <Pause aria-hidden className="size-4" /> : <Play aria-hidden className="size-4" />}
        </button>
      </div>
    );
  }

  if (playing) {
    return embed ? (
      <iframe
        src={embed}
        title={title}
        className="h-full w-full"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
      />
    ) : (
      <video className="h-full w-full bg-black object-contain" src={url} controls autoPlay playsInline aria-label={title} />
    );
  }

  return (
    <button
      type="button"
      disabled={inert}
      onClick={() => setPlaying(true)}
      className="group relative block h-full w-full overflow-hidden text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      aria-label={`${labels.play}: ${title}`}
    >
      {poster}
      <span className="absolute inset-0 bg-black/20 transition-colors group-hover:bg-black/30" />
      <span className="absolute top-1/2 left-1/2 inline-flex size-16 -translate-1/2 items-center justify-center rounded-full bg-white text-black shadow-lg transition-transform group-hover:scale-105 sm:size-20">
        <Play aria-hidden className="ml-1 size-7 fill-current" />
      </span>
    </button>
  );
}

/* ------------------------------------------------------- recently viewed */

export interface ViewedProduct {
  id: string;
  name: string;
  href: string;
  imageUrl: string | null;
  price: string;
}

const viewedKey = (storeId: string) => `sf-viewed:${storeId}`;

function readViewed(storeId: string): ViewedProduct[] {
  try {
    return parseViewed(window.localStorage.getItem(viewedKey(storeId)));
  } catch {
    return [];
  }
}

function parseViewed(raw: string | null): ViewedProduct[] {
  try {
    const parsed = JSON.parse(raw ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((p) => p && typeof p.id === "string").slice(0, 16) : [];
  } catch {
    return [];
  }
}

/**
 * The products this shopper looked at in this store, newest first, kept on
 * their own device. The product page records itself; nothing is sent anywhere.
 */
export function RecentlyViewed({
  storeId,
  current,
  title,
  limit,
  ratio,
}: {
  storeId: string;
  current: ViewedProduct | null;
  title: string;
  limit: number;
  ratio: string;
}) {
  // This product is left out, so recording this visit below changes nothing shown.
  const stored = useSyncExternalStore(
    () => () => {},
    () => window.localStorage.getItem(viewedKey(storeId)),
    () => null,
  );
  const items = useMemo(() => parseViewed(stored).filter((p) => p.id !== current?.id).slice(0, limit), [stored, current, limit]);

  useEffect(() => {
    if (!current) return;
    try {
      const before = readViewed(storeId);
      window.localStorage.setItem(viewedKey(storeId), JSON.stringify([current, ...before.filter((p) => p.id !== current.id)].slice(0, 16)));
    } catch {
      // Private browsing or a full store: nothing to remember then.
    }
  }, [storeId, current]);

  if (items.length === 0) return null;
  return (
    <section aria-labelledby="recently-viewed" className="mt-16 border-t border-border pt-10">
      <h2 id="recently-viewed" className="font-heading text-xl font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      <ul className="no-scrollbar mt-6 flex snap-x gap-4 overflow-x-auto pb-1">
        {items.map((item) => (
          <li key={item.id} className="w-36 shrink-0 snap-start sm:w-44">
            <a href={item.href} className="group block rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
              <span className="block overflow-hidden rounded-[var(--radius)] bg-muted" style={{ aspectRatio: ratio }}>
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                ) : null}
              </span>
              <span className="mt-2 block truncate text-sm font-medium text-foreground">{item.name}</span>
              <span className="block text-sm text-muted-foreground tabular-nums">{item.price}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------- newsletter */

/** The sign-up form. Locks while it posts; signing up twice keeps one record. */
export function NewsletterForm({
  storeId,
  source,
  labels,
  inert = false,
  className,
}: {
  storeId: string;
  source: string;
  labels: { email: string; button: string; placeholder: string };
  inert?: boolean;
  className?: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(subscribeNewsletter, { status: "idle" });
  const id = `newsletter-${source}`;
  if (state.status === "success") {
    return (
      <p role="status" className={cn("text-sm font-medium text-foreground", className)}>
        {state.message}
      </p>
    );
  }
  return (
    <form action={action} className={cn("flex w-full max-w-md flex-col gap-2 sm:flex-row", className)}>
      <input type="hidden" name="storeId" value={storeId} />
      <input type="hidden" name="source" value={source} />
      <label htmlFor={id} className="sr-only">
        {labels.email}
      </label>
      <input
        id={id}
        type="email"
        name="email"
        required
        autoComplete="email"
        placeholder={labels.placeholder}
        aria-invalid={state.status === "error" || undefined}
        aria-describedby={state.status === "error" ? `${id}-error` : undefined}
        className="h-11 min-w-0 flex-1 rounded-[var(--radius)] border border-input bg-background px-3.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring [[data-buttons=pill]_&]:rounded-full"
      />
      <button type="submit" disabled={pending || inert} className="sf-btn sf-btn-primary shrink-0 disabled:opacity-60">
        {labels.button}
      </button>
      {state.status === "error" ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive sm:basis-full">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

/* ----------------------------------------------------------------- header */

/** Marks the header once the page has scrolled, so a header over a hero turns solid. */
export function HeaderScrollState() {
  useEffect(() => {
    const header = document.querySelector<HTMLElement>(".sf-header");
    if (!header) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      header.dataset.scrolled = window.scrollY > 24 ? "true" : "false";
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
