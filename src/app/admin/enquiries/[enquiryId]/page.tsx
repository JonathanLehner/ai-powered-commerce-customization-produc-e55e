import { getLocale, getTranslations } from "next-intl/server";
import { AdminNotFoundView } from "@/components/NotFoundViews";
import { Badge, Breadcrumbs, DataList, PageHeader } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LOCALE_NAMES, isLocale } from "@/i18n/locales";
import { getPlanEnquiry } from "@/lib/data";
import { planEnquiryLabel, UNDECIDED } from "@/lib/enquiry";
import { requirePlatformAdmin } from "@/lib/session";
import { formatDateTime } from "@/lib/util";

/** One plan enquiry from the contact page: the page the sales alert email links to. */
export default async function AdminEnquiryPage({ params }: { params: Promise<{ enquiryId: string }> }) {
  await requirePlatformAdmin();
  const { enquiryId } = await params;
  const enquiry = await getPlanEnquiry(enquiryId);
  if (!enquiry) return <AdminNotFoundView />;
  const [t, overview, locale] = await Promise.all([
    getTranslations("admin.enquiry"),
    getTranslations("admin.overview"),
    getLocale(),
  ]);
  const plan = enquiry.plan === UNDECIDED ? overview("undecided") : planEnquiryLabel(enquiry.plan);

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: overview("enquiries"), href: "/admin" }, { label: enquiry.company }]} />
      <PageHeader
        title={enquiry.company}
        description={`${enquiry.name} · ${formatDateTime(enquiry.createdAt, locale)}`}
        actions={
          <>
            <Badge tone={enquiry.plan === UNDECIDED ? "slate" : "brand"}>{plan}</Badge>
            <Button asChild size="sm">
              <a href={`mailto:${enquiry.email}`}>{t("reply")}</a>
            </Button>
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle asChild>
              <h2>{t("details")}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DataList
              rows={[
                { label: t("name"), value: enquiry.name },
                {
                  label: t("email"),
                  value: (
                    <a href={`mailto:${enquiry.email}`} className="hover:underline">
                      {enquiry.email}
                    </a>
                  ),
                },
                { label: t("company"), value: enquiry.company },
                { label: t("plan"), value: plan },
                { label: t("replyBy"), value: enquiry.wantsCall ? t("replyCall") : t("replyEmail") },
                ...(isLocale(enquiry.locale) ? [{ label: t("language"), value: LOCALE_NAMES[enquiry.locale] }] : []),
                { label: t("received"), value: formatDateTime(enquiry.createdAt, locale) },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle asChild>
              <h2>{t("message")}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-line text-muted-foreground">{enquiry.message || t("noMessage")}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
