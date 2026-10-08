import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { Badge as ShadcnBadge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

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
        <span className="text-[15px] font-semibold tracking-tight text-foreground">Parcelith</span>
      ) : null}
    </span>
  );
}

type Tone = "neutral" | "brand" | "iris" | "green" | "amber" | "rose" | "slate";

/**
 * The seven meanings the workspace labels things with, expressed in the shadcn
 * tokens. Neutral and slate sit on the zinc scale; the rest keep a hue, because
 * an exception and a success have to be told apart at a glance.
 */
const TONE_CLASSES: Record<Tone, string> = {
  neutral: "border-border bg-muted text-foreground/80",
  brand: "border-brand-200 bg-brand-50 text-brand-800",
  iris: "border-iris-200 bg-iris-50 text-iris-800",
  green: "border-emerald-200 bg-emerald-50 text-emerald-700",
  amber: "border-amber-200 bg-amber-50 text-amber-800",
  rose: "border-rose-200 bg-rose-50 text-rose-700",
  slate: "border-border bg-muted text-muted-foreground",
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
    <ShadcnBadge variant="outline" className={cn("h-5.5 gap-1 px-2", TONE_CLASSES[tone], className)}>
      {children}
    </ShadcnBadge>
  );
}

export function Dot({ tone = "neutral" }: { tone?: Tone }) {
  const colours: Record<Tone, string> = {
    neutral: "bg-muted-foreground",
    brand: "bg-primary",
    iris: "bg-iris-500",
    green: "bg-emerald-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
    slate: "bg-muted-foreground",
  };
  return <span className={cn("inline-block h-1.5 w-1.5 rounded-full", colours[tone])} />;
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
    <div className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">{title}</h1>
        {description ? (
          <div className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</div>
        ) : null}
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
    <Card className="border border-dashed border-border bg-muted/50 py-0 ring-0">
      <CardContent className="flex flex-col items-center justify-center px-6 py-14 text-center">
        {icon ? <div className="mb-3 text-primary">{icon}</div> : null}
        <h3 className="font-heading text-base font-medium text-foreground">{title}</h3>
        <p className="mt-1.5 max-w-md text-sm text-muted-foreground">{description}</p>
        {action ? <div className="mt-5">{action}</div> : null}
      </CardContent>
    </Card>
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
    neutral: "text-foreground",
    brand: "text-brand-700",
    iris: "text-iris-700",
    green: "text-emerald-700",
    amber: "text-amber-700",
    rose: "text-rose-700",
    slate: "text-muted-foreground",
  };
  return (
    <Card size="sm" className="border border-border ring-0">
      <CardContent>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className={cn("mt-1 text-2xl font-semibold tracking-tight tabular-nums", accents[tone])}>
          {value}
        </p>
        {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
      </CardContent>
    </Card>
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
    <div className={cn("rounded-lg border px-4 py-3 text-sm", TONE_CLASSES[tone])}>
      {title ? <p className="font-medium">{title}</p> : null}
      <div className={title ? "mt-1" : undefined}>{children}</div>
    </div>
  );
}

export function Breadcrumbs({
  items,
  label = "Breadcrumb",
}: {
  items: { label: string; href?: string }[];
  /** The landmark's own name, translated on a storefront. */
  label?: string;
}) {
  return (
    <Breadcrumb aria-label={label} className="mb-4">
      <BreadcrumbList className="text-xs">
        {items.map((item, i) => (
          // The separator is a list item of its own: nesting it inside the
          // crumb puts an <li> inside an <li>, which React refuses to hydrate.
          <Fragment key={`${item.label}-${i}`}>
            <BreadcrumbItem>
              {item.href ? (
                <BreadcrumbLink asChild>
                  <Link href={item.href}>{item.label}</Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{item.label}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
            {i < items.length - 1 ? <BreadcrumbSeparator /> : null}
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export function DataList({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="divide-y divide-border text-sm">
      {rows.map((row) => (
        <div key={row.label} className="flex items-start justify-between gap-4 py-2.5">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="text-right font-medium text-foreground">{row.value}</dd>
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
        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>{label}</span>
          <span className="tabular-nums">{Math.round(pct)}%</span>
        </div>
      ) : null}
      <Progress value={Math.round(pct)} aria-label={label} className="h-1.5" />
    </div>
  );
}

/**
 * The body of a not-found or error page: an eyebrow, a heading, an explanation
 * and a row of ways out. Every fallback in the app is built from it, so a 404 in
 * the workspace and a 404 in a storefront read as the same product.
 */
export function FallbackPanel({
  eyebrow,
  title,
  description,
  actions,
  note,
}: {
  eyebrow: string;
  title: string;
  description: ReactNode;
  actions?: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6 sm:py-20">
      <p className="section-title">{eyebrow}</p>
      <h1 className="font-heading mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        {title}
      </h1>
      <div className="mt-3 text-sm leading-6 text-inksoft">{description}</div>
      {actions ? <div className="mt-7 flex flex-wrap items-center gap-2.5">{actions}</div> : null}
      {note ? <p className="mt-8 text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}
