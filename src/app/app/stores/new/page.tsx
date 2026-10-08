import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { Badge, Breadcrumbs, Callout, PageHeader } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { agencyStoreAllowance, getAgency, listAgencies } from "@/lib/data";
import { planStoreLabel, storeLimitMessage, storeUsageLabel } from "@/lib/plans";
import { accessibleStores, requireUser } from "@/lib/session";
import { formatDate } from "@/lib/util";
import { ArchiveStoreForm } from "./ArchiveStoreForm";
import { NewStoreForm } from "./NewStoreForm";

export default async function NewStorePage() {
  const user = await requireUser();
  if (user.platformRole === "agency_member") redirect("/app?denied=1");

  // The store list and the agency do not depend on each other, so they are read
  // together; the plan usage needs the agency's plan and follows.
  const [stores, agency] = await Promise.all([
    accessibleStores(user),
    user.agencyId ? getAgency(user.agencyId) : listAgencies().then((all) => all[0] ?? null),
  ]);
  const allowance = agency ? await agencyStoreAllowance(agency) : null;

  const liveStores = agency
    ? stores
        .map(({ store }) => store)
        .filter((store) => store.agencyId === agency.id && store.status === "active")
    : [];

  return (
    <>
      <AppHeader user={user} stores={stores} />
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-7 sm:px-6">
        <Breadcrumbs items={[{ label: "Stores", href: "/app" }, { label: "New store" }]} />
        <PageHeader
          title="Create a client store"
          description={`${agency ? `${agency.name} · ` : ""}A store is an isolated commerce channel: its own catalog, customers, orders, currencies, tax settings, storefront and Stripe account.`}
          actions={
            allowance ? (
              <Badge tone={allowance.atLimit ? "amber" : "neutral"}>
                {allowance.plan.name} · {storeUsageLabel(allowance)}
              </Badge>
            ) : null
          }
        />

        <div className="mt-6">
          {!agency || !allowance ? (
            <Callout tone="amber" title="No agency assigned">
              Your account is not linked to an agency yet, so there is nowhere to create the store. Ask the
              platform administrator to add you to one.
            </Callout>
          ) : allowance.atLimit ? (
            <div className="space-y-5">
              <Callout tone="amber" title={`${allowance.plan.name} plan limit reached`}>
                {storeLimitMessage(allowance, agency.name)}
              </Callout>

              <Card asChild>
              <section>
                <CardHeader>
                <CardTitle asChild>
                  <h2>Archive a store</h2>
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Archiving takes that storefront offline and stops new orders. Its products, orders and audit
                  history are kept, and it can be restored later — archived stores do not count against the
                  plan.
                </p>
                </CardHeader>
                <CardContent>
                <ul className="divide-y divide-border border-y border-border text-sm">
                  {liveStores.map((store) => (
                    <li key={store.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                      <span className="min-w-0">
                        <Link
                          href={`/app/stores/${store.id}`}
                          className="block truncate font-medium text-foreground hover:underline"
                        >
                          {store.name}
                        </Link>
                        <span className="block truncate text-xs text-muted-foreground">
                          {store.clientName} · live since {formatDate(store.createdAt)}
                        </span>
                      </span>
                      <ArchiveStoreForm storeId={store.id} storeName={store.name} />
                    </li>
                  ))}
                  {liveStores.length === 0 ? (
                    <li className="py-2.5 text-muted-foreground">
                      No live stores are visible from this account. Ask the platform administrator to review
                      the agency&rsquo;s plan.
                    </li>
                  ) : null}
                </ul>
                </CardContent>
              </section>
              </Card>

              <Card asChild>
              <section>
                <CardHeader>
                <CardTitle asChild>
                  <h2>Move up a plan</h2>
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {allowance.nextPlan
                    ? `${allowance.nextPlan.name} runs ${planStoreLabel(allowance.nextPlan).toLowerCase()} on the same workspace — nothing is migrated and no store is interrupted.`
                    : "This is the top plan. Talk to us about running more stores under one agreement."}
                </p>
                </CardHeader>
                <CardContent>
                <div className="flex flex-wrap items-center gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href="/pricing">Compare plans</Link>
                  </Button>
                  {user.platformRole === "platform_admin" ? (
                    <Button asChild size="sm">
                      <Link href="/admin/agencies">Change this agency&rsquo;s plan</Link>
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      A platform administrator applies the change to {agency.name}.
                    </span>
                  )}
                </div>
                </CardContent>
              </section>
              </Card>
            </div>
          ) : (
            <NewStoreForm
              agencyId={agency.id}
              agencyName={agency.name}
              allowanceNote={
                allowance.limit === null
                  ? `${allowance.plan.name} plan · no live-store limit.`
                  : `${allowance.plan.name} plan · ${storeUsageLabel(allowance)}, ${allowance.remaining} ${allowance.remaining === 1 ? "place" : "places"} left.`
              }
            />
          )}
        </div>

        {allowance?.atLimit ? null : (
          <div className="mt-6">
            <Callout tone="brand" title="What happens next">
              You will land on the seven-step setup checklist: branding, language and currencies, shopper
              support contacts, custom domain, Stripe, carriers and tax. The storefront stays offline until
              payments and shipping are connected.
            </Callout>
          </div>
        )}
      </div>
    </>
  );
}
