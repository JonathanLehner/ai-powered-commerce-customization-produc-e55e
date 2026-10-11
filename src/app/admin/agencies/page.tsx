import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { setAgencyStatus } from "@/app/actions/admin";
import { Badge, PageHeader } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listAgencies, listAllStores, listUsers } from "@/lib/data";
import { storeUsageText } from "@/i18n/plan-copy";
import { PLANS, storeAllowance, type PlanKey } from "@/lib/plans";
import { formatDate } from "@/lib/util";
import { AgencyPlanForm } from "./AgencyForms";

/** The small uppercase heading the workspace uses above a list inside a card. */
const SECTION_TITLE = "text-xs font-semibold tracking-wide text-muted-foreground uppercase";

export default async function AdminAgenciesPage() {
  const [agencies, stores, users] = await Promise.all([listAgencies(), listAllStores(), listUsers()]);

  const [pages, t, locale] = await Promise.all([
    getTranslations("pages.admin"),
    getTranslations("admin.agencies"),
    getLocale(),
  ]);
  const usage = new Map(
    await Promise.all(
      agencies.map(async (agency) => {
        const live = stores.filter((s) => s.agencyId === agency.id && s.status === "active").length;
        return [agency.id, await storeUsageText(storeAllowance(agency.plan, live))] as const;
      }),
    ),
  );
  return (
    <div className="space-y-6">
      <PageHeader
        title={pages("agenciesTitle")}
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
                    <Badge tone={agency.status === "active" ? "green" : "rose"}>
                      {agency.status === "active" ? t("active") : t("suspended")}
                    </Badge>
                    <Badge tone="brand">{PLANS[agency.plan as PlanKey]?.name ?? agency.plan}</Badge>
                    {allowance.atLimit ? <Badge tone="amber">{t("atLimit")}</Badge> : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("meta", {
                      email: agency.contactEmail,
                      date: formatDate(agency.createdAt, locale),
                      usage: usage.get(agency.id) ?? "",
                      total: agencyStores.length,
                      people: agencyUsers.length,
                    })}
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
                      {agency.status === "active" ? t("suspend") : t("reactivate")}
                    </Button>
                  </form>
                </div>
              </CardHeader>

              <CardContent className="grid gap-5 lg:grid-cols-2">
                <div>
                  <h3 className={SECTION_TITLE}>{t("stores")}</h3>
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
                          <Badge tone={store.status === "active" ? "green" : "slate"}>
                            {store.status === "active" ? t("storeActive") : t("storeArchived")}
                          </Badge>
                          <Badge tone="neutral">{store.defaultCurrency}</Badge>
                        </span>
                      </li>
                    ))}
                    {agencyStores.length === 0 ? (
                      <li className="py-2 text-muted-foreground">{t("noStores")}</li>
                    ) : null}
                  </ul>
                </div>
                <div>
                  <h3 className={SECTION_TITLE}>{t("people")}</h3>
                  <ul className="mt-2 divide-y divide-border text-sm">
                    {agencyUsers.map((person) => (
                      <li key={person.id} className="flex items-center justify-between gap-3 py-2">
                        <span className="min-w-0">
                          <span className="block truncate text-foreground">{person.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{person.email}</span>
                        </span>
                        <Badge tone={person.platformRole === "agency_admin" ? "brand" : "neutral"}>
                          {person.platformRole === "agency_admin" ? t("agencyAdmin") : t("member")}
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
