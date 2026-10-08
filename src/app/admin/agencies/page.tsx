import Link from "next/link";
import { setAgencyStatus } from "@/app/actions/admin";
import { Badge, PageHeader } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listAgencies, listAllStores, listUsers } from "@/lib/data";
import { storeAllowance, storeUsageLabel } from "@/lib/plans";
import { formatDate } from "@/lib/util";
import { AgencyPlanForm } from "./AgencyForms";

/** The small uppercase heading the workspace uses above a list inside a card. */
const SECTION_TITLE = "text-xs font-semibold tracking-wide text-muted-foreground uppercase";

export default async function AdminAgenciesPage() {
  const [agencies, stores, users] = await Promise.all([listAgencies(), listAllStores(), listUsers()]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agencies and store access"
        description="Which agency operates which stores, and who inside each agency can reach them."
      />

      <ul className="space-y-5">
        {agencies.map((agency) => {
          const agencyStores = stores.filter((s) => s.agencyId === agency.id);
          const agencyUsers = users.filter((u) => u.agencyId === agency.id);
          // The plan's ceiling applies to live stores only, so an operator can
          // see before changing a plan what it would leave the agency running.
          const allowance = storeAllowance(
            agency.plan,
            agencyStores.filter((s) => s.status === "active").length,
          );
          return (
            <Card asChild key={agency.id}>
            <li>
              <CardHeader className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle asChild>
                      <h2>{agency.name}</h2>
                    </CardTitle>
                    <Badge tone={agency.status === "active" ? "green" : "rose"}>{agency.status}</Badge>
                    <Badge tone="brand">{agency.plan}</Badge>
                    {allowance.atLimit ? <Badge tone="amber">at store limit</Badge> : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {agency.contactEmail} · joined {formatDate(agency.createdAt)} · {storeUsageLabel(allowance)}{" "}
                    ({agencyStores.length} in total) · {agencyUsers.length} people
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <AgencyPlanForm agency={agency} />
                  <form action={setAgencyStatus}>
                    <input type="hidden" name="agencyId" value={agency.id} />
                    <input type="hidden" name="status" value={agency.status === "active" ? "suspended" : "active"} />
                    <Button
                      type="submit"
                      variant={agency.status === "active" ? "destructive" : "default"}
                      size="sm"
                    >
                      {agency.status === "active" ? "Suspend" : "Reactivate"}
                    </Button>
                  </form>
                </div>
              </CardHeader>

              <CardContent className="grid gap-5 lg:grid-cols-2">
                <div>
                  <h3 className={SECTION_TITLE}>Stores</h3>
                  <ul className="mt-2 divide-y divide-border text-sm">
                    {agencyStores.map((store) => (
                      <li key={store.id} className="flex items-center justify-between gap-3 py-2">
                        <Link
                          href={`/app/stores/${store.id}`}
                          className="min-w-0 truncate text-foreground hover:underline"
                        >
                          {store.name}
                        </Link>
                        <span className="flex shrink-0 items-center gap-1.5">
                          <Badge tone={store.status === "active" ? "green" : "slate"}>{store.status}</Badge>
                          <Badge tone="neutral">{store.defaultCurrency}</Badge>
                        </span>
                      </li>
                    ))}
                    {agencyStores.length === 0 ? (
                      <li className="py-2 text-muted-foreground">No stores yet.</li>
                    ) : null}
                  </ul>
                </div>
                <div>
                  <h3 className={SECTION_TITLE}>People</h3>
                  <ul className="mt-2 divide-y divide-border text-sm">
                    {agencyUsers.map((person) => (
                      <li key={person.id} className="flex items-center justify-between gap-3 py-2">
                        <span className="min-w-0">
                          <span className="block truncate text-foreground">{person.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{person.email}</span>
                        </span>
                        <Badge tone={person.platformRole === "agency_admin" ? "brand" : "neutral"}>
                          {person.platformRole === "agency_admin" ? "Agency admin" : "Member"}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </li>
            </Card>
          );
        })}
      </ul>
    </div>
  );
}
