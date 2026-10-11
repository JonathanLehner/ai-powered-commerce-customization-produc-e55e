import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { asLocale, pageMetadata } from "@/i18n/metadata";
import { Link } from "@/i18n/navigation";
import { Section } from "../../kit";

/**
 * `/signup` while plan billing is not configured: the proxy serves this
 * prerendered page in its place, so no account is made that could not be paid for.
 */
export const dynamic = "force-static";

export async function generateMetadata({ params }: PageProps<"/[locale]/signup/contact-sales">): Promise<Metadata> {
  return pageMetadata(asLocale((await params).locale), "/signup", "signup");
}

export default async function SignupContactSalesPage({ params }: PageProps<"/[locale]/signup/contact-sales">) {
  setRequestLocale(asLocale((await params).locale));
  const t = await getTranslations("signup");

  return (
    <Section className="pt-10 sm:pt-14">
      <h1 className="font-heading text-[2rem] leading-[1.1] font-semibold tracking-tight text-foreground sm:text-4xl">
        {t("unavailableTitle")}
      </h1>
      <p className="mt-3 max-w-[62ch] text-base text-muted-foreground">
        {t.rich("unavailableLead", {
          link: (chunks) => (
            <Link href="/contact" className="font-medium text-foreground underline">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </Section>
  );
}
