import { getLocale, getTranslations } from "next-intl/server";
import { Badge, PageHeader } from "@/components/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listPlatformAdmins } from "@/lib/operations/platform-admins";
import { getSessionUser } from "@/lib/session";
import { formatDate } from "@/lib/util";
import { AddPlatformAdminForm, PlatformAdminActions } from "./AdminForms";

/** The column-head style every table in the workspace shares. */
const TH = "px-0 text-xs font-semibold tracking-wide uppercase text-muted-foreground";

/** Platform administrators. The admin layout already admits platform administrators only. */
export default async function AdminAdminsPage() {
  const [admins, me, t, locale] = await Promise.all([
    listPlatformAdmins(),
    getSessionUser(),
    getTranslations("admin.admins"),
    getLocale(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} />

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-foreground">{t("addTitle")}</h2>
        <AddPlatformAdminForm />
      </section>

      <Card asChild>
        <section>
          <CardHeader>
            <CardTitle asChild>
              <h2>{t("listTitle")}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative overflow-x-auto">
              <Table className="min-w-[44rem]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={TH}>{t("columns.name")}</TableHead>
                    <TableHead className={TH}>{t("columns.lastSignIn")}</TableHead>
                    <TableHead className={TH}>{t("columns.password")}</TableHead>
                    <TableHead className={`${TH} text-right`}>
                      <span className="sr-only">{t("columns.actions")}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {admins.map((admin) => (
                    <TableRow key={admin.id} className="hover:bg-transparent">
                      <TableCell className="px-0 py-3 align-top whitespace-normal">
                        <p className="font-medium text-foreground">
                          {admin.name}
                          {admin.id === me?.id ? <span className="ml-2 text-xs text-muted-foreground">{t("you")}</span> : null}
                        </p>
                        <p className="text-xs text-muted-foreground">{admin.email}</p>
                      </TableCell>
                      <TableCell className="px-0 py-3 align-top text-xs text-inksoft">
                        {admin.lastSignInAt ? formatDate(admin.lastSignInAt, locale) : t("unknown")}
                      </TableCell>
                      <TableCell className="px-0 py-3 align-top">
                        {admin.hasPassword ? (
                          <Badge tone="green">{t("passwordSet")}</Badge>
                        ) : (
                          <Badge tone="amber">{t("invited")}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="px-0 py-3 text-right align-top">
                        <PlatformAdminActions
                          userId={admin.id}
                          name={admin.name}
                          invited={!admin.hasPassword}
                          self={admin.id === me?.id}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </section>
      </Card>
    </div>
  );
}
