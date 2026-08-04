import Link from "next/link";
import { setAgencyPlan, setAgencyStatus } from "@/app/actions/admin";
import { Badge, PageHeader } from "@/components/ui";
import { listAgencies, listAllStores, listUsers } from "@/lib/data";
import { PLAN_KEYS, storeAllowance, storeUsageLabel } from "@/lib/plans";
import { formatDate } from "@/lib/util";

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
            <li key={agency.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-ink">{agency.name}</h2>
                    <Badge tone={agency.status === "active" ? "green" : "rose"}>{agency.status}</Badge>
                    <Badge tone="brand">{agency.plan}</Badge>
                    {allowance.atLimit ? <Badge tone="amber">at store limit</Badge> : null}
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {agency.contactEmail} · joined {formatDate(agency.createdAt)} · {storeUsageLabel(allowance)}{" "}
                    ({agencyStores.length} in total) · {agencyUsers.length} people
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <form action={setAgencyPlan} className="flex items-center gap-2">
                    <input type="hidden" name="agencyId" value={agency.id} />
                    <label htmlFor={`plan-${agency.id}`} className="sr-only">
                      Plan for {agency.name}
                    </label>
                    <select
                      id={`plan-${agency.id}`}
                      name="plan"
                      defaultValue={agency.plan}
                      className="input mt-0 w-32 py-1.5 text-sm"
                    >
                      {PLAN_KEYS.map((plan) => (
                        <option key={plan} value={plan}>
                          {plan}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="btn-secondary btn-sm">
                      Set plan
                    </button>
                  </form>
                  <form action={setAgencyStatus}>
                    <input type="hidden" name="agencyId" value={agency.id} />
                    <input type="hidden" name="status" value={agency.status === "active" ? "suspended" : "active"} />
                    <button
                      type="submit"
                      className={agency.status === "active" ? "btn-danger btn-sm" : "btn-primary btn-sm"}
                    >
                      {agency.status === "active" ? "Suspend" : "Reactivate"}
                    </button>
                  </form>
                </div>
              </div>

              <div className="mt-5 grid gap-5 lg:grid-cols-2">
                <div>
                  <h3 className="section-title">Stores</h3>
                  <ul className="mt-2 divide-y divide-line text-sm">
                    {agencyStores.map((store) => (
                      <li key={store.id} className="flex items-center justify-between gap-3 py-2">
                        <Link href={`/app/stores/${store.id}`} className="min-w-0 truncate text-ink hover:underline">
                          {store.name}
                        </Link>
                        <span className="flex shrink-0 items-center gap-1.5">
                          <Badge tone={store.status === "active" ? "green" : "slate"}>{store.status}</Badge>
                          <Badge tone="neutral">{store.defaultCurrency}</Badge>
                        </span>
                      </li>
                    ))}
                    {agencyStores.length === 0 ? (
                      <li className="py-2 text-muted">No stores yet.</li>
                    ) : null}
                  </ul>
                </div>
                <div>
                  <h3 className="section-title">People</h3>
                  <ul className="mt-2 divide-y divide-line text-sm">
                    {agencyUsers.map((person) => (
                      <li key={person.id} className="flex items-center justify-between gap-3 py-2">
                        <span className="min-w-0">
                          <span className="block truncate text-ink">{person.name}</span>
                          <span className="block truncate text-xs text-muted">{person.email}</span>
                        </span>
                        <Badge tone={person.platformRole === "agency_admin" ? "brand" : "neutral"}>
                          {person.platformRole === "agency_admin" ? "Agency admin" : "Member"}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
