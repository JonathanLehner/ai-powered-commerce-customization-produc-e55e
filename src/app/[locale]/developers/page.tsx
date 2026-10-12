import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { CopyCode } from "@/components/CopyCode";
import { McpConnect } from "@/components/McpConnect";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { asLocale, pageMetadata } from "@/i18n/metadata";
import { ADMIN_SCOPE, API_RATE_LIMIT } from "@/lib/api-scopes";
import { fullPath } from "@/lib/api/define";
import { API_OPERATIONS, API_TAGS, toolName } from "@/lib/api/operations";
import { API_BASE_URL, OPENAPI_URL, restExample } from "@/lib/mcp/connect";
import { CheckList, Section, SectionHeading } from "../kit";

export const dynamic = "force-static";

export async function generateMetadata({ params }: PageProps<"/[locale]/developers">): Promise<Metadata> {
  return pageMetadata(asLocale((await params).locale), "/developers", "developers");
}

const METHOD_TONE: Record<string, string> = {
  GET: "text-emerald-700 dark:text-emerald-400",
  POST: "text-sky-700 dark:text-sky-400",
  PUT: "text-amber-700 dark:text-amber-400",
  PATCH: "text-amber-700 dark:text-amber-400",
  DELETE: "text-rose-700 dark:text-rose-400",
};

export default async function DevelopersPage({ params }: PageProps<"/[locale]/developers">) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("developers");

  return (
    <>
      <section className="border-b border-border">
        <div className="mx-auto w-full max-w-4xl px-4 py-14 sm:px-6 sm:py-20">
          <h1 className="font-heading max-w-[24ch] text-[2rem] leading-[1.1] font-semibold tracking-tight text-balance text-foreground sm:text-5xl">
            {t("title")}
          </h1>
          <p className="mt-5 max-w-[60ch] text-base leading-relaxed text-muted-foreground sm:text-lg">{t("lead")}</p>
        </div>
      </section>

      <Section width="prose">
        <SectionHeading lead={t("keysBody")}>{t("keysTitle")}</SectionHeading>
        <Card className="mt-6">
          <CardContent>
            <CheckList items={t.raw("keysSteps") as string[]} />
          </CardContent>
        </Card>
        <h3 className="mt-8 font-heading text-lg font-semibold tracking-tight text-foreground">{t("platformTitle")}</h3>
        <p className="mt-2 max-w-[64ch] text-sm leading-relaxed text-muted-foreground">
          {t("platformBody", { scope: ADMIN_SCOPE })}
        </p>
      </Section>

      <Section tone="muted" width="prose" id="mcp">
        <SectionHeading>{t("connect.title")}</SectionHeading>
        <Card className="mt-6">
          <CardContent>
            <McpConnect locale={locale} />
          </CardContent>
        </Card>
      </Section>

      <Section width="prose" id="rest">
        <SectionHeading lead={t("restBody")}>{t("restTitle")}</SectionHeading>
        <Card className="mt-6">
          <CardContent className="space-y-5">
            <div className="space-y-1.5">
              <h3 className="text-sm font-medium text-foreground">{t("baseUrl")}</h3>
              <CopyCode value={API_BASE_URL} label={t("baseUrl")} />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-sm font-medium text-foreground">{t("example")}</h3>
              <CopyCode value={restExample("STORE_ID")} label={t("example")} />
            </div>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
              <li>{t("limits", { limit: API_RATE_LIMIT })}</li>
              <li>{t("paging")}</li>
              <li>
                <a href={OPENAPI_URL} className="font-medium text-primary underline-offset-2 hover:underline">
                  {t("openapi")}
                </a>
              </li>
            </ul>
          </CardContent>
        </Card>
      </Section>

      <Section tone="muted" id="reference">
        <SectionHeading lead={t("referenceBody")}>{t("referenceTitle")}</SectionHeading>
        <div className="mt-6 space-y-8">
          {API_TAGS.map((tag) => (
            <div key={tag}>
              <h3 className="font-heading text-lg font-semibold tracking-tight text-foreground">{t(`tags.${tag}`)}</h3>
              <div className="mt-3 overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
                <table className="w-full min-w-[40rem] text-left text-sm">
                  <thead className="border-b border-border text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    <tr>
                      <th scope="col" className="px-4 py-2.5">{t("columns.endpoint")}</th>
                      <th scope="col" className="px-4 py-2.5">{t("columns.tool")}</th>
                      <th scope="col" className="px-4 py-2.5">{t("columns.scope")}</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono text-xs">
                    {API_OPERATIONS.filter((operation) => operation.tag === tag).map((operation) => (
                      <tr key={operation.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-2.5 align-top text-foreground">
                          <span className={`mr-2 font-semibold ${METHOD_TONE[operation.method]}`}>{operation.method}</span>
                          {fullPath(operation)}
                        </td>
                        <td className="px-4 py-2.5 align-top text-inksoft">{toolName(operation)}</td>
                        <td className="px-4 py-2.5 align-top text-muted-foreground">{operation.scope}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section width="prose">
        <Card>
          <CardContent className="py-2">
            <h2 className="font-heading text-xl font-semibold tracking-tight text-foreground">{t("ctaTitle")}</h2>
            <p className="mt-3 max-w-[64ch] text-sm leading-relaxed text-muted-foreground">{t("ctaBody")}</p>
            <Button asChild size="lg" className="mt-6 px-4">
              <Link href="/login">{t("cta")}</Link>
            </Button>
          </CardContent>
        </Card>
      </Section>
    </>
  );
}
