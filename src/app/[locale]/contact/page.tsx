import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { asLocale, pageMetadata } from "@/i18n/metadata";
import Link from "next/link";
import { ContactForm } from "./ContactForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Section } from "../kit";

export const dynamic = "force-static";

export async function generateMetadata({ params }: PageProps<"/[locale]/contact">): Promise<Metadata> {
  return pageMetadata(asLocale((await params).locale), "/contact", "contact");
}

export default async function ContactPage({ params }: PageProps<"/[locale]/contact">) {
  setRequestLocale(asLocale((await params).locale));
  const t = await getTranslations("contact");

  return (
    <>
      <section className="border-b border-border">
        <div className="mx-auto w-full max-w-4xl px-4 py-14 sm:px-6 sm:py-20">
          <h1 className="font-heading text-[2rem] leading-[1.1] font-semibold tracking-tight text-foreground sm:text-5xl">
            {t("title")}
          </h1>
          <p className="mt-4 max-w-[62ch] text-base text-muted-foreground sm:text-lg">
            {t("lead")}
          </p>
        </div>
      </section>

      <Section>
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-10">
          <Card>
            <CardContent>
              <ContactForm />
            </CardContent>
          </Card>

          <Card size="sm">
            <CardContent>
              <h2 className="text-sm font-semibold text-foreground">{t("demoTitle")}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{t("demoBody")}</p>
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link href="/login">{t("demoCta")}</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </Section>
    </>
  );
}
