import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { requestPasswordReset } from "@/app/actions/auth";
import { SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "../AuthShell";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.forgot");
  return { title: `${t("title")} · Parcelith` };
}

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const [{ sent, error }, t] = await Promise.all([searchParams, getTranslations("auth.forgot")]);

  return (
    <AuthShell>
      <Card asChild>
        <section>
          <CardContent>
            {sent ? (
              <>
                <h1 className="font-heading text-lg font-semibold tracking-tight text-foreground">{t("sentTitle")}</h1>
                <p className="mt-2 text-sm text-muted-foreground">{t("sentBody")}</p>
              </>
            ) : (
              <>
                <h1 className="font-heading text-lg font-semibold tracking-tight text-foreground">{t("title")}</h1>
                <p className="mt-2 text-sm text-muted-foreground">{t("lead")}</p>
                <form action={requestPasswordReset} className="mt-6">
                  <Label htmlFor="forgot-email">{t("email")}</Label>
                  <Input
                    id="forgot-email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    required
                    maxLength={254}
                    className="mt-1.5"
                    aria-describedby={error === "email" ? "forgot-email-error" : undefined}
                    aria-invalid={error === "email" ? true : undefined}
                  />
                  {error === "email" ? (
                    <p id="forgot-email-error" className="mt-1.5 text-xs text-destructive">
                      {t("emailError")}
                    </p>
                  ) : null}
                  <SubmitButton pendingLabel={t("sending")} className="mt-4 w-full">
                    {t("submit")}
                  </SubmitButton>
                </form>
              </>
            )}
            <Button asChild variant="ghost" size="sm" className="mt-4 -ml-2">
              <Link href="/login">{t("back")}</Link>
            </Button>
          </CardContent>
        </section>
      </Card>
    </AuthShell>
  );
}
