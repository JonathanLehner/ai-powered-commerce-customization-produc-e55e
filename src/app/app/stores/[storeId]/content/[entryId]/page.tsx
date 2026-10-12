import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { deleteEntry } from "@/app/actions/content";
import { ConfirmSubmit } from "@/components/forms";
import { StoreWorkspaceNotFoundView } from "@/components/NotFoundViews";
import { Badge, Breadcrumbs, Callout, PageHeader } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LOCALE_NAMES } from "@/i18n/locales";
import { storeLanguages } from "@/i18n/storefront-routing";
import { contentPath } from "@/lib/content";
import { findEntry } from "@/lib/operations/content";
import { sanitizeRichText } from "@/lib/rich-text";
import { requireStoreAccess, roleCan } from "@/lib/session";
import { ContentTabs } from "../ContentTabs";
import { EntryForm, EntryTranslations } from "./EntryEditor";

export default async function EntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string; entryId: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const [{ storeId, entryId }, { created }] = await Promise.all([params, searchParams]);
  const { store, role } = await requireStoreAccess(storeId);
  const [entry, t] = await Promise.all([findEntry(storeId, entryId), getTranslations("content")]);
  if (!entry) return <StoreWorkspaceNotFoundView base={`/app/stores/${storeId}`} />;

  const canEdit = roleCan(role, "store.storefront");
  const base = `/app/stores/${storeId}/content`;
  const listHref = entry.kind === "post" ? `${base}?kind=post` : base;
  const { locales, defaultLocale } = storeLanguages(store);
  const editable = {
    id: entry.id,
    kind: entry.kind,
    title: entry.title,
    handle: entry.handle,
    body: entry.body,
    excerpt: entry.excerpt,
    seoTitle: entry.seoTitle,
    seoDescription: entry.seoDescription,
    coverImageUrl: entry.coverImageUrl,
    status: entry.status,
    translations: entry.translations ?? {},
  };

  return (
    <div className="space-y-6">
      <ContentTabs storeId={storeId} active={entry.kind} />
      <div>
        <Breadcrumbs
          label={t("breadcrumb")}
          items={[{ label: entry.kind === "page" ? t("pagesTitle") : t("postsTitle"), href: listHref }, { label: entry.title }]}
        />
        <PageHeader
          title={entry.title}
          description={
            <Badge tone={entry.status === "published" ? "green" : "slate"}>
              {entry.status === "published" ? t("published") : t("draft")}
            </Badge>
          }
          actions={
            entry.status === "published" ? (
              <Button asChild variant="outline">
                <Link href={`/s/${store.slug}${contentPath(entry.kind, entry.handle)}`} target="_blank" rel="noreferrer" prefetch={false}>
                  {t("viewLive")}
                </Link>
              </Button>
            ) : null
          }
        />
      </div>

      {created ? (
        <Callout tone="green" title={t("createdTitle")}>
          {t("createdBody")}
        </Callout>
      ) : null}

      {canEdit ? (
        <>
          <Card>
            <CardContent>
              <EntryForm storeId={storeId} entry={editable} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle asChild className="text-sm font-semibold">
                <h2>{t("translations")}</h2>
              </CardTitle>
              <p className="text-xs text-muted-foreground">{t("translationsHint")}</p>
            </CardHeader>
            <CardContent>
              <EntryTranslations
                storeId={storeId}
                entry={editable}
                languages={locales.filter((code) => code !== defaultLocale).map((code) => ({ code, name: LOCALE_NAMES[code] }))}
              />
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle asChild className="text-sm font-semibold">
                <h2>{entry.kind === "page" ? t("deletePage") : t("deletePost")}</h2>
              </CardTitle>
              <p className="text-xs text-muted-foreground">{t("deleteBody")}</p>
            </CardHeader>
            <CardContent>
              <form action={deleteEntry}>
                <input type="hidden" name="storeId" value={storeId} />
                <input type="hidden" name="entryId" value={entry.id} />
                <ConfirmSubmit confirmLabel={t("deleteConfirm")} variant="destructive" size="sm">
                  {t("delete")}
                </ConfirmSubmit>
              </form>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent>
            <div className="rich-text" dangerouslySetInnerHTML={{ __html: sanitizeRichText(entry.body) }} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
