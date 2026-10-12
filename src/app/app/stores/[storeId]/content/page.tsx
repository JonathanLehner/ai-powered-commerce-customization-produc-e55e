import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { contentPath } from "@/lib/content";
import { listContentEntries } from "@/lib/content-data";
import { requireStoreAccess, roleCan } from "@/lib/session";
import { formatDate } from "@/lib/util";
import { ContentTabs } from "./ContentTabs";
import { CreateEntryForm } from "./ContentForms";

export default async function ContentPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ kind?: string }>;
}) {
  const [{ storeId }, { kind: rawKind }] = await Promise.all([params, searchParams]);
  const kind = rawKind === "post" ? "post" : "page";
  const { role } = await requireStoreAccess(storeId);
  const canEdit = roleCan(role, "store.storefront");
  const [entries, t, locale] = await Promise.all([
    listContentEntries(storeId, kind),
    getTranslations("content"),
    getLocale(),
  ]);
  const base = `/app/stores/${storeId}/content`;

  return (
    <div className="space-y-6">
      <ContentTabs storeId={storeId} active={kind} />
      <PageHeader
        title={kind === "page" ? t("pagesTitle") : t("postsTitle")}
        description={kind === "page" ? t("pagesDescription") : t("postsDescription")}
      />

      {canEdit ? (
        <Card size="sm">
          <CardHeader>
            <CardTitle asChild className="text-sm font-semibold">
              <h2>{kind === "page" ? t("newPage") : t("newPost")}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CreateEntryForm storeId={storeId} kind={kind} />
          </CardContent>
        </Card>
      ) : null}

      {entries.length === 0 ? (
        <EmptyState title={kind === "page" ? t("emptyPages") : t("emptyPosts")} />
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("title")}</TableHead>
                <TableHead>{t("address")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead className="text-right">{t("updated")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-medium">
                    <Link href={`${base}/${entry.id}`} className="text-foreground hover:underline">
                      {entry.title}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{contentPath(entry.kind, entry.handle)}</TableCell>
                  <TableCell>
                    <Badge tone={entry.status === "published" ? "green" : "slate"}>
                      {entry.status === "published" ? t("published") : t("draft")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                    {formatDate(entry.updatedAt, locale)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
