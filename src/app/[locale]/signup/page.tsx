import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { asLocale, pageMetadata } from "@/i18n/metadata";
import { Section } from "../kit";
import { SignupForm } from "./SignupForm";

export const dynamic = "force-static";

export async function generateMetadata({ params }: PageProps<"/[locale]/signup">): Promise<Metadata> {
  return pageMetadata(asLocale((await params).locale), "/signup", "signup");
}

export default async function SignupPage({ params }: PageProps<"/[locale]/signup">) {
  setRequestLocale(asLocale((await params).locale));
  const t = await getTranslations("signup");

  return (
    <Section className="pt-10 sm:pt-14">
      <h1 className="font-heading text-[2rem] leading-[1.1] font-semibold tracking-tight text-foreground sm:text-4xl">
        {t("title")}
      </h1>
      <p className="mt-3 max-w-[62ch] text-base text-muted-foreground">{t("lead")}</p>
      <div className="mt-8">
        <SignupForm />
      </div>
    </Section>
  );
}
