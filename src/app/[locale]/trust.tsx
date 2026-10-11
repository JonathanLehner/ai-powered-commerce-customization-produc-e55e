import { CreditCardIcon, ScrollTextIcon, ShieldCheckIcon, UsersIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { Section, SectionHeading } from "./kit";

const SECURITY = [
  { key: "payments", icon: CreditCardIcon },
  { key: "separation", icon: ShieldCheckIcon },
  { key: "roles", icon: UsersIcon },
  { key: "audit", icon: ScrollTextIcon },
] as const;

type Quote = { quote: string; name: string; role: string; agency: string };

/** Short quotes from agencies, shared by the home and pricing pages. */
export async function TrustStrip({ tone }: { tone?: "plain" | "muted" }) {
  const t = await getTranslations("trust");
  const quotes = t.raw("quotes") as Quote[];

  return (
    <Section tone={tone}>
      <SectionHeading>{t("title")}</SectionHeading>
      <ul className="mt-8 grid gap-4 md:grid-cols-3">
        {quotes.map((quote) => (
          <Card asChild key={quote.agency} className="h-full">
            <li>
              <CardContent className="flex h-full flex-col">
                <blockquote className="text-sm leading-relaxed text-foreground">{quote.quote}</blockquote>
                <p className="mt-auto pt-5 text-sm">
                  <span className="font-heading block font-semibold text-foreground">{quote.agency}</span>
                  <span className="text-muted-foreground">
                    {quote.name}, {quote.role}
                  </span>
                </p>
              </CardContent>
            </li>
          </Card>
        ))}
      </ul>
    </Section>
  );
}

/** How payments, store data, team access and the audit log are protected. */
export async function SecurityBlock({ tone }: { tone?: "plain" | "muted" }) {
  const t = await getTranslations("trust");

  return (
    <Section tone={tone}>
      <SectionHeading lead={t("securityLead")}>{t("securityTitle")}</SectionHeading>
      <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {SECURITY.map((item) => (
          <li key={item.key}>
            <item.icon aria-hidden className="size-5 text-primary" />
            <h3 className="mt-3 text-sm font-semibold text-foreground">{t(`security.${item.key}.title`)}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t(`security.${item.key}.body`)}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
