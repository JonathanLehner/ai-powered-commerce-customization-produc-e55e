import { getTranslations } from "next-intl/server";
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

  const pages = await getTranslations("pages.store");
  return (
    <>
      <AppHeader user={user} stores={stores} />
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-7 sm:px-6">
        <Breadcrumbs items={[{ label: "Stores", href: "/app" }, { label: "New store" }]} />
        <PageHeader
          title={pages("newStoreTitle")}
          description={agency?.name}
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
              Ask a platform administrator to add your account to an agency.
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
                  Archived stores go offline and do not count toward your plan. You can restore them later.
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
                      No live stores.
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
                    ? `${allowance.nextPlan.name} includes ${planStoreLabel(allowance.nextPlan).toLowerCase()}.`
                    : "Contact sales to add more stores."}
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
                      Plan changes are made by a platform administrator.
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
              allowanceNote={
                allowance.limit === null
                  ? `${allowance.plan.name} plan · no live-store limit`
                  : `${allowance.plan.name} plan · ${storeUsageLabel(allowance)}`
              }
            />
          )}
        </div>

      </div>
    </>
  );
}
