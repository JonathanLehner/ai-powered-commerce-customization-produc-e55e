import { getLocale, getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { resendInvite } from "@/app/actions/team";
import { Badge, PageHeader } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAgency, listMemberships, listUsers } from "@/lib/data";
import { requireStoreAccess } from "@/lib/session";
import { formatDate } from "@/lib/util";
import { InviteForm } from "./InviteForm";
import { MemberRoleForm, RemoveMemberForm } from "./MemberActions";

/** The column-head style every table in the workspace shares. */
const TH = "px-0 text-xs font-semibold tracking-wide uppercase text-muted-foreground";

export default async function TeamPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const { store } = await requireStoreAccess(storeId, "store.team");
  const [memberships, users, agency, headerList] = await Promise.all([
    listMemberships(storeId),
    listUsers(),
    getAgency(store.agencyId),
    headers(),
  ]);

  // The same link the invitation email carries, shown so it can be passed on by
  // hand as well; it needs the full origin the admin is looking at.
  const host = headerList.get("host") ?? "";
  const proto = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = host ? `${proto}://${host}` : "";

  const agencyAdmins = users.filter(
    (u) => u.agencyId === store.agencyId && u.platformRole === "agency_admin",
  );

  const [pages, t, locale] = await Promise.all([
    getTranslations("pages.store"),
    getTranslations("team"),
    getLocale(),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        title={pages("teamTitle")}
      />

      <Card asChild>
      <section>
        <CardHeader>
        <CardTitle asChild>
          <h2>{t("agencyAdmins")}</h2>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {t("agencyAdminsBody", { agency: agency?.name ?? t("agencyFallback") })}
        </p>
        </CardHeader>
        <CardContent>
        <ul className="divide-y divide-border">
          {agencyAdmins.map((admin) => (
            <li key={admin.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{admin.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {admin.email} · {admin.title}
                </p>
              </div>
              <Badge tone="brand">{t("agencyAdminBadge")}</Badge>
            </li>
          ))}
          {agencyAdmins.length === 0 ? (
            <li className="py-3 text-sm text-muted-foreground">{t("noAgencyAdmins")}</li>
          ) : null}
        </ul>
        </CardContent>
      </section>
      </Card>

      <Card asChild>
      <section>
        <CardHeader>
        <CardTitle asChild>
          <h2>{t("members")}</h2>
        </CardTitle>
        {memberships.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("noMembers")}
          </p>
        ) : null}
        </CardHeader>
        {memberships.length === 0 ? null : (
          <CardContent>
          <div className="relative overflow-x-auto">
            <Table className="min-w-[46rem]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className={TH}>{t("colPerson")}</TableHead>
                  <TableHead className={TH}>{t("colStatus")}</TableHead>
                  <TableHead className={TH}>{t("colRole")}</TableHead>
                  <TableHead className={`${TH} text-right`}>{t("colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {memberships.map((member) => (
                  <TableRow key={member.id} id={member.id} className="scroll-mt-24 hover:bg-transparent target:bg-muted/50">
                    <TableCell className="px-0 py-3 align-top whitespace-normal">
                      <p className="font-medium text-foreground">{member.name}</p>
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                    </TableCell>
                    <TableCell className="px-0 py-3 align-top whitespace-normal">
                      <Badge tone={member.status === "active" ? "green" : "amber"}>
                        {member.status === "active" ? t("active") : t("pending")}
                      </Badge>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("invitedBy", { date: formatDate(member.invitedAt, locale), name: member.invitedBy })}
                      </p>
                      {member.status === "invited" ? (
                        member.inviteToken ? (
                          <div className="mt-2 max-w-sm">
                            <p className="text-xs text-muted-foreground">
                              {t("inviteLink")}
                            </p>
                            <code className="mt-1 block break-all rounded-lg border border-border bg-canvas px-2 py-1.5 text-[11px] text-inksoft">
                              {origin}/invite/{member.inviteToken}
                            </code>
                          </div>
                        ) : (
                          <p className="mt-2 max-w-sm text-xs text-amber-700">
                            {t("noLink")}
                          </p>
                        )
                      ) : null}
                    </TableCell>
                    <TableCell className="px-0 py-3 align-top whitespace-normal">
                      <MemberRoleForm
                        storeId={storeId}
                        membershipId={member.id}
                        name={member.name}
                        role={member.role}
                      />
                    </TableCell>
                    <TableCell className="px-0 py-3 align-top whitespace-normal">
                      <div className="flex justify-end gap-2">
                        {member.status === "invited" ? (
                          <form action={resendInvite}>
                            <input type="hidden" name="storeId" value={storeId} />
                            <input type="hidden" name="membershipId" value={member.id} />
                            <Button
                              type="submit"
                              variant="ghost"
                              size="sm"
                              title={t("newLinkTitle")}
                            >
                              {t("newLink")}
                            </Button>
                          </form>
                        ) : null}
                        <RemoveMemberForm
                          storeId={storeId}
                          membershipId={member.id}
                          name={member.name}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          </CardContent>
        )}
      </section>
      </Card>

      <InviteForm storeId={storeId} />

    </div>
  );
}
