import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Suspense } from "react";
import { signInAs, signInWithPassword } from "@/app/actions/auth";
import { Badge, Logo } from "@/components/ui";
import { isLocale, localizedPath } from "@/i18n/locales";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SignInError } from "./SignInError";

/**
 * Rendered per request: the screen is in the visitor's language, which comes
 * from their browser until they have chosen one in the workspace.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: `${t("metaTitle")} · Parcelith`, description: t("metaDescription") };
}

const PERSONAS = [
  { key: "alex", email: "alex@northlight.studio", name: "Alex Moreau", tone: "brand" },
  { key: "sam", email: "sam@northlight.studio", name: "Sam Okafor", tone: "iris" },
  { key: "ines", email: "ines@northlight.studio", name: "Inés Duarte", tone: "amber" },
  { key: "dana", email: "dana@northwind.example", name: "Dana Whitfield", tone: "slate" },
  { key: "priya", email: "ops@parcelith.com", name: "Priya Raman", tone: "green" },
] as const;

export default async function LoginPage() {
  const [t, locale] = await Promise.all([getTranslations("auth"), getLocale()]);
  const signupHref = localizedPath("/signup", isLocale(locale) ? locale : "en");

  return (
    <div className="flex min-h-screen flex-col bg-muted">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/">
            <Logo />
          </Link>
          <Button asChild variant="ghost">
            <Link href="/how-it-works">{t("howItWorks")}</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <section>
          <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">
            {t("title")}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{t("lead")}</p>
          <Suspense fallback={null}>
            <SignInError />
          </Suspense>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {PERSONAS.map((persona) => (
              <li key={persona.email}>
                <Card asChild size="sm" className="h-full transition hover:ring-primary/30">
                <form action={signInAs}>
                    <input type="hidden" name="email" value={persona.email} />
                    <CardContent>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">{persona.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{t(`personas.${persona.key}.title`)}</p>
                        </div>
                        <Badge tone={persona.tone}>{persona.email.split("@")[1]}</Badge>
                      </div>
                      <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{t(`personas.${persona.key}.blurb`)}</p>
                      <Button type="submit" variant="outline" size="sm" className="mt-4 w-full">
                        {t("continueAs", { name: persona.name.split(" ")[0] })}
                      </Button>
                    </CardContent>
                </form>
                </Card>
              </li>
            ))}
            <li>
              <Card size="sm" className="h-full border-dashed">
                <CardContent className="flex h-full flex-col">
                  <p className="text-sm font-semibold text-foreground">{t("createTitle")}</p>
                  <p className="mt-2.5 flex-1 text-sm leading-relaxed text-muted-foreground">{t("createBlurb")}</p>
                  <Button asChild size="sm" className="mt-4 w-full">
                    <Link href={signupHref}>{t("createAccount")}</Link>
                  </Button>
                </CardContent>
              </Card>
            </li>
          </ul>
          <Card asChild size="sm" className="mt-6">
          <form action={signInWithPassword}>
              <CardHeader>
                <p className="text-sm font-semibold text-foreground">{t("passwordTitle")}</p>
                <p className="text-xs text-muted-foreground">
                  {t.rich("passwordHint", { code: (chunks) => <code className="font-mono">{chunks}</code> })}
                </p>
              </CardHeader>
              <CardContent className="flex flex-wrap items-end gap-2">
                <div className="grid content-start gap-1.5">
                  <Label htmlFor="password-email">{t("email")}</Label>
                  <Input
                    id="password-email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    required
                    placeholder={t("emailPlaceholder")}
                    className="w-full sm:w-64"
                  />
                </div>
                <div className="grid content-start gap-1.5">
                  <Label htmlFor="password-password">{t("password")}</Label>
                  <Input
                    id="password-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    className="w-full sm:w-48"
                  />
                </div>
                <Button type="submit" variant="outline" size="sm">
                  {t("signIn")}
                </Button>
              </CardContent>
          </form>
          </Card>

          <Card asChild size="sm" className="mt-4">
          <form action={signInAs}>
              <CardContent>
                <Label htmlFor="signin-email">
                  {t("invitedEmail")}
                </Label>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Input
                    id="signin-email"
                    name="email"
                    type="email"
                    required
                    placeholder={t("emailPlaceholder")}
                    className="w-full sm:w-72"
                  />
                  <Button type="submit" variant="outline" size="sm">
                    {t("continue")}
                  </Button>
                </div>
              </CardContent>
          </form>
          </Card>

          
        </section>
      </main>
    </div>
  );
}
