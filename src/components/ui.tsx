import Link from "next/link";
import type { ReactNode } from "react";
import { classNames } from "@/lib/util";

/**
 * Intrinsic size of `public/logo.png` — kept in step with the trimmed mark that
 * `scripts/install-logo.mjs` writes, so the header reserves the exact width and
 * the logo cannot shift the nav as it loads.
 */
const LOGO_WIDTH = 309;
const LOGO_HEIGHT = 356;

export function Logo({ size = 32, withWordmark = true }: { size?: number; withWordmark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.png"
        alt="Parcelith"
        width={Math.round((size * LOGO_WIDTH) / LOGO_HEIGHT)}
        height={size}
        decoding="async"
        style={{ width: "auto", height: size, aspectRatio: `${LOGO_WIDTH} / ${LOGO_HEIGHT}` }}
        className="shrink-0"
      />
      {withWordmark ? (
        <span className="text-[17px] font-semibold tracking-tight text-ink">Parcelith</span>
      ) : null}
    </span>
  );
}

type Tone = "neutral" | "brand" | "iris" | "green" | "amber" | "rose" | "slate";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-canvas text-inksoft border-line",
  brand: "bg-brand-50 text-brand-700 border-brand-200",
  iris: "bg-iris-50 text-iris-700 border-iris-200",
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-800 border-amber-200",
  rose: "bg-rose-50 text-rose-700 border-rose-200",
  slate: "bg-slate-100 text-slate-700 border-slate-200",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={classNames(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Dot({ tone = "neutral" }: { tone?: Tone }) {
  const colours: Record<Tone, string> = {
    neutral: "bg-slate-400",
    brand: "bg-brand-500",
    iris: "bg-iris-500",
    green: "bg-emerald-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
    slate: "bg-slate-500",
  };
  return <span className={classNames("inline-block h-1.5 w-1.5 rounded-full", colours[tone])} />;
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">{title}</h1>
        {description ? <div className="mt-1.5 max-w-2xl text-sm text-muted">{description}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-canvas px-6 py-14 text-center">
      {icon ? <div className="mb-3 text-brand-500">{icon}</div> : null}
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm text-muted">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
}) {
  const accents: Record<Tone, string> = {
    neutral: "text-ink",
    brand: "text-brand-700",
    iris: "text-iris-700",
    green: "text-emerald-700",
    amber: "text-amber-700",
    rose: "text-rose-700",
    slate: "text-slate-700",
  };
  return (
    <div className="card p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={classNames("mt-1 text-2xl font-semibold tracking-tight tabular-nums", accents[tone])}>
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs text-muted">{sub}</p> : null}
    </div>
  );
}

export function Callout({
  tone = "brand",
  title,
  children,
}: {
  tone?: Tone;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className={classNames("rounded-lg border px-4 py-3 text-sm", TONE_CLASSES[tone])}>
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={title ? "mt-1" : undefined}>{children}</div>
    </div>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-muted">
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`} className="flex items-center gap-1.5">
          {item.href ? (
            <Link href={item.href} className="hover:text-ink hover:underline">
              {item.label}
            </Link>
          ) : (
            <span className="text-ink">{item.label}</span>
          )}
          {i < items.length - 1 ? <span aria-hidden>/</span> : null}
        </span>
      ))}
    </nav>
  );
}

export function DataList({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="divide-y divide-line text-sm">
      {rows.map((row) => (
        <div key={row.label} className="flex items-start justify-between gap-4 py-2.5">
          <dt className="text-muted">{row.label}</dt>
          <dd className="text-right font-medium text-ink">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div>
      {label ? (
        <div className="mb-1 flex items-center justify-between text-xs text-muted">
          <span>{label}</span>
          <span className="tabular-nums">{Math.round(pct)}%</span>
        </div>
      ) : null}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-canvas" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
