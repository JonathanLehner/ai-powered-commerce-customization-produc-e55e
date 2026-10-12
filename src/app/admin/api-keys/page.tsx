import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listPlatformApiKeys } from "@/lib/api-keys";
import { ADMIN_SCOPE, API_KEY_PREFIX } from "@/lib/api-scopes";
import { formatDate } from "@/lib/util";
import { CreatePlatformKeyForm, RevokePlatformKeyForm } from "./PlatformKeyForms";

/** The column-head style every table in the workspace shares. */
const TH = "px-0 text-xs font-semibold tracking-wide uppercase text-muted-foreground";

/** Platform keys. The admin layout already admits platform administrators only. */
export default async function AdminApiKeysPage() {
  const [keys, t, locale] = await Promise.all([listPlatformApiKeys(), getTranslations("apiKeys"), getLocale()]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={
          <>
            {t("platform.description")}{" "}
            <Link href="/developers" prefetch={false} className="font-medium text-primary underline-offset-2 hover:underline">
              {t("reference")}
            </Link>
          </>
        }
      />

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-foreground">{t("createTitle")}</h2>
        <CreatePlatformKeyForm />
      </section>

      {keys.length === 0 ? (
        <EmptyState title={t("emptyTitle")} description={t("emptyBody")} />
      ) : (
        <Card asChild>
          <section>
            <CardHeader>
              <CardTitle asChild>
                <h2>{t("keysTitle")}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative overflow-x-auto">
                <Table className="min-w-[44rem]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className={TH}>{t("columns.name")}</TableHead>
                      <TableHead className={TH}>{t("columns.access")}</TableHead>
                      <TableHead className={TH}>{t("columns.created")}</TableHead>
                      <TableHead className={TH}>{t("columns.lastUsed")}</TableHead>
                      <TableHead className={`${TH} text-right`}>{t("columns.status")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {keys.map((key) => (
                      <TableRow key={key.id} className="hover:bg-transparent">
                        <TableCell className="px-0 py-3 align-top whitespace-normal">
                          <p className="font-medium text-foreground">{key.name}</p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {API_KEY_PREFIX}…{key.last4}
                          </p>
                        </TableCell>
                        <TableCell className="px-0 py-3 align-top">
                          <Badge tone="brand">{ADMIN_SCOPE}</Badge>
                        </TableCell>
                        <TableCell className="px-0 py-3 align-top text-xs text-inksoft whitespace-normal">
                          {t("createdBy", { date: formatDate(key.createdAt, locale), name: key.createdByName })}
                        </TableCell>
                        <TableCell className="px-0 py-3 align-top text-xs text-inksoft">
                          {key.lastUsedAt ? formatDate(key.lastUsedAt, locale) : t("never")}
                        </TableCell>
                        <TableCell className="px-0 py-3 text-right align-top">
                          {key.revokedAt ? (
                            <div className="flex flex-col items-end gap-1">
                              <Badge tone="slate">{t("revoked")}</Badge>
                              <span className="text-xs text-muted-foreground">{formatDate(key.revokedAt, locale)}</span>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-3">
                              <Badge tone="green">{t("active")}</Badge>
                              <RevokePlatformKeyForm keyId={key.id} />
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </section>
        </Card>
      )}
    </div>
  );
}
