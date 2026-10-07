import { CreditCardIcon, GlobeIcon } from "lucide-react";
import Link from "next/link";
import { Badge, ProgressBar } from "@/components/ui";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { setupProgress, type StoreMetrics } from "@/lib/metrics";
import { THEMES, type Store } from "@/lib/types";
import { cn } from "@/lib/utils";

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * One client store on /app: who it belongs to, the access the reader holds, the
 * two pieces of setup that block going live, its figures and the ways in.
 *
 * The agency dashboard and the platform oversight view show the same card with
 * different figures — sales on one, operational counts on the other — so what
 * each of them counts is passed in rather than decided here.
 */
export function StoreCard({
  store,
  subtitle,
  badge,
  stats,
  metrics,
  withOrders = false,
}: {
  store: Store;
  subtitle: string;
  badge: { label: string; tone: "neutral" | "iris" };
  stats: { label: string; value: string }[];
  metrics: StoreMetrics;
  /** The queue is the store team's screen, so platform oversight has no link to it. */
  withOrders?: boolean;
}) {
  const progress = setupProgress(store.setup);
  const theme = THEMES[store.theme];

  return (
    <Card size="sm" className="h-full">
      <CardHeader className="gap-2">
        <div className="flex items-start gap-3">
          <Avatar size="lg" className="shrink-0">
            <AvatarFallback
              className="font-medium"
              style={{ background: theme.accent, color: theme.surface }}
            >
              {initials(store.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <Link
              href={`/app/stores/${store.id}`}
              className="font-heading text-base font-medium text-foreground hover:underline"
            >
              {store.name}
            </Link>
            <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
          </div>
          <Badge tone={badge.tone} className="shrink-0">
            {badge.label}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col">
        <ul className="space-y-1.5 text-xs text-muted-foreground">
          <li className="flex items-center gap-1.5">
            <CreditCardIcon
              aria-hidden
              className={cn("size-3.5", store.stripe.connected ? "text-emerald-600" : "text-amber-600")}
            />
            {store.stripe.connected ? "Stripe connected" : "Stripe pending"}
          </li>
          {store.customDomain ? (
            <li className="flex items-center gap-1.5">
              <GlobeIcon
                aria-hidden
                className={cn(
                  "size-3.5",
                  store.domainStatus === "verified" ? "text-emerald-600" : "text-amber-600",
                )}
              />
              <span className="truncate">{store.customDomain}</span>
            </li>
          ) : null}
        </ul>

        <dl className="mt-4 grid grid-cols-3 gap-3 border-y border-border py-3">
          {stats.map((stat) => (
            <div key={stat.label}>
              <dt className="text-xs text-muted-foreground">{stat.label}</dt>
              <dd className="mt-0.5 font-medium tabular-nums text-foreground">{stat.value}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-3 text-xs text-muted-foreground">
          {metrics.inProduction} in production · {metrics.shipped} shipped · {metrics.delivered} delivered
          {metrics.exceptions > 0 ? (
            <span className="text-rose-700">
              {" "}
              · {metrics.exceptions} exception{metrics.exceptions === 1 ? "" : "s"}
            </span>
          ) : null}
          {metrics.manualRouting > 0 ? (
            <span className="text-amber-700"> · {metrics.manualRouting} manual</span>
          ) : null}
        </p>

        {progress.pct < 100 ? (
          <div className="mt-4">
            <ProgressBar value={progress.pct} label={`Setup ${progress.done}/${progress.total}`} />
          </div>
        ) : null}
      </CardContent>

      <CardFooter className="gap-2">
        <Button asChild size="sm">
          <Link href={`/app/stores/${store.id}`}>Open</Link>
        </Button>
        {withOrders ? (
          <Button asChild variant="ghost" size="sm">
            <Link href={`/app/stores/${store.id}/orders`}>Orders</Link>
          </Button>
        ) : null}
        <Button asChild variant="ghost" size="sm">
          <Link href={`/s/${store.slug}`} target="_blank" rel="noreferrer">
            Storefront ↗
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
