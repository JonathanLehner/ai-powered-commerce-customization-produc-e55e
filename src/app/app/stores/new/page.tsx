import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { Badge, Breadcrumbs, Callout, PageHeader } from "@/components/ui";
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

              <section className="card p-5">
                <h2 className="text-base font-semibold text-ink">Archive a store</h2>
                <p className="mt-1 text-sm text-muted">
                  Archiving takes that storefront offline and stops new orders. Its products, orders and audit
                  history are kept, and it can be restored later — archived stores do not count against the
                  plan.
                </p>
                <ul className="mt-4 divide-y divide-line border-y border-line text-sm">
                  {liveStores.map((store) => (
                    <li key={store.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                      <span className="min-w-0">
                        <Link
                          href={`/app/stores/${store.id}`}
                          className="block truncate font-medium text-ink hover:underline"
                        >
                          {store.name}
                        </Link>
                        <span className="block truncate text-xs text-muted">
                          {store.clientName} · live since {formatDate(store.createdAt)}
                        </span>
                      </span>
                      <ArchiveStoreForm storeId={store.id} storeName={store.name} />
                    </li>
                  ))}
                  {liveStores.length === 0 ? (
                    <li className="py-2.5 text-muted">
                      No live stores are visible from this account. Ask the platform administrator to review
                      the agency&rsquo;s plan.
                    </li>
                  ) : null}
                </ul>
              </section>

              <section className="card p-5">
                <h2 className="text-base font-semibold text-ink">Move up a plan</h2>
                <p className="mt-1 text-sm text-muted">
                  {allowance.nextPlan
                    ? `${allowance.nextPlan.name} runs ${planStoreLabel(allowance.nextPlan).toLowerCase()} on the same workspace — nothing is migrated and no store is interrupted.`
                    : "This is the top plan. Talk to us about running more stores under one agreement."}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Link href="/pricing" className="btn-secondary btn-sm">
                    Compare plans
                  </Link>
                  {user.platformRole === "platform_admin" ? (
                    <Link href="/admin/agencies" className="btn-primary btn-sm">
                      Change this agency&rsquo;s plan
                    </Link>
                  ) : (
                    <span className="text-xs text-muted">
                      A platform administrator applies the change to {agency.name}.
                    </span>
                  )}
                </div>
              </section>
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
              You will land on the six-step setup checklist: branding, language and currencies, custom domain,
              Stripe, carriers and tax. The storefront stays offline until payments and shipping are connected.
            </Callout>
          </div>
        )}
      </div>
    </>
  );
}
