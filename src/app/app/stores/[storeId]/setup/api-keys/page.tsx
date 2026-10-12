import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { McpConnect } from "@/components/McpConnect";
import { Badge, Breadcrumbs, EmptyState, PageHeader } from "@/components/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listApiKeys } from "@/lib/api-keys";
import { API_KEY_PREFIX, API_RESOURCES, accessFor } from "@/lib/api-scopes";
import { asLocale } from "@/i18n/metadata";
import { requireStoreAccess } from "@/lib/session";
import { formatDate } from "@/lib/util";
import { CreateKeyForm, RevokeKeyForm } from "./ApiKeyForms";

/** The column-head style every table in the workspace shares. */
const TH = "px-0 text-xs font-semibold tracking-wide uppercase text-muted-foreground";

export default async function ApiKeysPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const { store, user } = await requireStoreAccess(storeId, "store.settings");
  const [keys, t, pages, developers, locale] = await Promise.all([
    listApiKeys(storeId),
    getTranslations("apiKeys"),
    getTranslations("pages.store"),
    getTranslations("developers"),
    getLocale(),
  ]);
  const base = `/app/stores/${store.id}`;

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: store.name, href: base },
          { label: pages("settingsTitle"), href: `${base}/setup` },
          { label: t("title") },
        ]}
      />
      <PageHeader
        title={t("title")}
        description={
          <>
            {t("description")}{" "}
            <Link href="/developers" prefetch={false} className="font-medium text-primary underline-offset-2 hover:underline">
              {t("reference")}
            </Link>
          </>
        }
      />

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-foreground">{t("createTitle")}</h2>
        <CreateKeyForm storeId={store.id} agencyAdmin={user.platformRole === "agency_admin" && user.agencyId === store.agencyId} />
      </section>

      <Card asChild>
        <section>
          <CardHeader>
            <CardTitle asChild>
              <h2>{developers("connect.title")}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <McpConnect locale={asLocale(locale)} />
          </CardContent>
        </section>
      </Card>

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
                <Table className="min-w-[52rem]">
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
                        <TableCell className="px-0 py-3 align-top whitespace-normal">
                          <ul className="flex max-w-sm flex-wrap gap-1.5">
                            {API_RESOURCES.flatMap((resource) => {
                              const access = accessFor(key.scopes, resource);
                              return access
                                ? [
                                    <li key={resource}>
                                      <Badge tone={access === "write" ? "brand" : "neutral"}>
                                        {t(`resources.${resource}`)}: {t(access)}
                                      </Badge>
                                    </li>,
                                  ]
                                : [];
                            })}
                          </ul>
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
                              <span className="text-xs text-muted-foreground">
                                {formatDate(key.revokedAt, locale)}
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-3">
                              <Badge tone="green">{t("active")}</Badge>
                              <RevokeKeyForm storeId={store.id} keyId={key.id} />
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
