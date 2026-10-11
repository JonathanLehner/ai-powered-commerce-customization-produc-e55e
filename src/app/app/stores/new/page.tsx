import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { Badge, Breadcrumbs, Callout, PageHeader } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { agencyStoreAllowance, getAgency, listAgencies } from "@/lib/data";
import { planStoresText, storeLimitText, storeUsageText } from "@/i18n/plan-copy";
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

  const [pages, t, locale] = await Promise.all([getTranslations("pages.store"), getTranslations("newStore"), getLocale()]);
  const usage = allowance ? await storeUsageText(allowance) : "";
  const limitText = allowance?.atLimit && agency ? await storeLimitText(allowance, agency.name) : "";
  const nextPlanStores = allowance?.nextPlan ? await planStoresText(allowance.nextPlan) : "";
  return (
    <>
      <AppHeader user={user} stores={stores} />
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-7 sm:px-6">
        <Breadcrumbs items={[{ label: t("stores"), href: "/app" }, { label: t("newStore") }]} />
        <PageHeader
          title={pages("newStoreTitle")}
          description={agency?.name}
          actions={
            allowance ? (
              <Badge tone={allowance.atLimit ? "amber" : "neutral"}>
                {allowance.plan.name} · {usage}
              </Badge>
            ) : null
          }
        />

        <div className="mt-6">
          {!agency || !allowance ? (
            <Callout tone="amber" title={t("noAgencyTitle")}>
              {t("noAgencyBody")}
            </Callout>
          ) : allowance.atLimit ? (
            <div className="space-y-5">
              <Callout tone="amber" title={t("limitTitle", { plan: allowance.plan.name })}>
                {limitText}
              </Callout>

              <Card asChild>
              <section>
                <CardHeader>
                <CardTitle asChild>
                  <h2>{t("archiveTitle")}</h2>
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {t("archiveBody")}
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
                          {t("liveSince", { client: store.clientName, date: formatDate(store.createdAt, locale) })}
                        </span>
                      </span>
                      <ArchiveStoreForm storeId={store.id} storeName={store.name} />
                    </li>
                  ))}
                  {liveStores.length === 0 ? (
                    <li className="py-2.5 text-muted-foreground">
                      {t("noLiveStores")}
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
                  <h2>{t("moveUpTitle")}</h2>
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {allowance.nextPlan
                    ? t("nextPlanIncludes", { plan: allowance.nextPlan.name, stores: nextPlanStores })
                    : t("contactSales")}
                </p>
                </CardHeader>
                <CardContent>
                <div className="flex flex-wrap items-center gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href="/pricing">{t("comparePlans")}</Link>
                  </Button>
                  {user.platformRole === "platform_admin" ? (
                    <Button asChild size="sm">
                      <Link href="/admin/agencies">{t("changePlan")}</Link>
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {t("planChangesBy")}
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
                  ? t("noLimitNote", { plan: allowance.plan.name })
                  : t("usageNote", { plan: allowance.plan.name, usage })
              }
            />
          )}
        </div>

      </div>
    </>
  );
}
