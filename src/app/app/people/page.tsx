import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listMembershipsForStores, listStoresForAgency, listUsers } from "@/lib/data";
import { peopleGrid } from "@/lib/people";
import { accessibleStores, requireAgencyAdmin } from "@/lib/session";
import { InvitePersonForm } from "./InvitePersonForm";
import { RemoveEverywhereForm } from "./RemoveEverywhereForm";

const TH = "text-xs font-semibold tracking-wide uppercase text-muted-foreground";

/**
 * Everyone who can reach the agency's stores, one row per person and one column
 * per store. Roles stay per store: each cell opens that store's Team page.
 */
export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const showArchived = (await searchParams).archived === "1";
  const user = await requireAgencyAdmin();
  const [allStores, users, accessible] = await Promise.all([
    listStoresForAgency(user.agencyId),
    listUsers(),
    accessibleStores(user),
  ]);
  const stores = [...allStores].sort(
    (a, b) => Number(a.status === "archived") - Number(b.status === "archived") || a.name.localeCompare(b.name),
  );
  const memberships = await listMembershipsForStores(stores.map((s) => s.id));
  // Removal always covers every store, archived ones included; the columns
  // only show archived stores when asked to.
  const allRows = peopleGrid(user.agencyId, users, memberships, stores);
  const columns = showArchived ? stores : stores.filter((s) => s.status === "active");
  const archivedCount = stores.length - stores.filter((s) => s.status === "active").length;
  const rows = allRows.filter((row) => row.agencyAdmin || columns.some((s) => row.cells[s.id]));
  const storeById = new Map(stores.map((s) => [s.id, s]));

  const [t, roles] = await Promise.all([getTranslations("people"), getTranslations("roles")]);

  return (
    <>
      <AppHeader user={user} stores={accessible} />
      <div className="mx-auto w-full max-w-[92rem] flex-1 space-y-6 px-4 py-7 sm:px-6">
        <PageHeader
          title={t("title")}
          description={t("description", { people: rows.length, stores: columns.length })}
          actions={
            <Button asChild variant="outline" size="sm">
              <Link href="/app">{t("back")}</Link>
            </Button>
          }
        />

        {columns.length === 0 && archivedCount === 0 ? (
          <EmptyState title={t("noStoresTitle")} description={t("noStoresBody")} />
        ) : (
          <Card asChild>
            <section aria-labelledby="people-access">
              <CardHeader>
                <CardTitle asChild>
                  <h2 id="people-access">{t("accessTitle")}</h2>
                </CardTitle>
                {archivedCount > 0 ? (
                  <CardAction>
                    <Link
                      href={showArchived ? "/app/people" : "/app/people?archived=1"}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {showArchived ? t("hideArchived") : t("showArchived", { count: archivedCount })}
                    </Link>
                  </CardAction>
                ) : null}
              </CardHeader>
              <CardContent>
                <div className="relative overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className={`${TH} sticky left-0 z-10 bg-card pl-0`}>{t("colPerson")}</TableHead>
                        {columns.map((store) => (
                          <TableHead key={store.id} className={`${TH} min-w-36 whitespace-normal`}>
                            <Link href={`/app/stores/${store.id}/team`} className="hover:underline">
                              {store.name}
                            </Link>
                            {store.status === "archived" ? (
                              <span className="block font-normal normal-case tracking-normal">{t("archived")}</span>
                            ) : null}
                          </TableHead>
                        ))}
                        <TableHead className={`${TH} pr-0 text-right`}>
                          <span className="sr-only">{t("colActions")}</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => {
                        const reach = Object.entries(row.cells).map(([storeId, cell]) => {
                          const store = storeById.get(storeId);
                          return {
                            membershipId: cell.membershipId,
                            storeName: store?.status === "archived" ? t("archivedStore", { name: store.name }) : (store?.name ?? storeId),
                          };
                        });
                        return (
                          <TableRow key={row.email} className="hover:bg-transparent">
                            <TableCell className="sticky left-0 z-10 bg-card py-3 pl-0 align-top whitespace-normal">
                              <p className="font-medium text-foreground">{row.name}</p>
                              <p className="text-xs text-muted-foreground">{row.email}</p>
                            </TableCell>
                            {columns.map((store) => {
                              if (row.agencyAdmin) {
                                return (
                                  <TableCell key={store.id} className="py-3 align-top">
                                    <Badge tone="brand">{roles("platform.agency_admin")}</Badge>
                                  </TableCell>
                                );
                              }
                              const cell = row.cells[store.id];
                              return (
                                <TableCell key={store.id} className="py-3 align-top whitespace-normal">
                                  {cell ? (
                                    <Link
                                      href={`/app/stores/${store.id}/team#${cell.membershipId}`}
                                      className="text-sm text-foreground hover:underline"
                                    >
                                      {roles(cell.role)}
                                      {cell.status === "invited" ? (
                                        <span className="mt-1 block">
                                          <Badge tone="amber">{t("invited")}</Badge>
                                        </span>
                                      ) : null}
                                    </Link>
                                  ) : (
                                    <span className="text-sm text-muted-foreground" aria-label={t("noAccess")}>
                                      –
                                    </span>
                                  )}
                                </TableCell>
                              );
                            })}
                            <TableCell className="py-3 pr-0 text-right align-top">
                              {row.agencyAdmin || reach.length === 0 ? null : (
                                <RemoveEverywhereForm email={row.email} name={row.name} stores={reach} />
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </section>
          </Card>
        )}

        {stores.some((s) => s.status === "active") ? (
          <InvitePersonForm
            stores={stores.filter((s) => s.status === "active").map((s) => ({ id: s.id, name: s.name }))}
          />
        ) : null}
      </div>
    </>
  );
}
