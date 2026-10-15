import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { resetPassword } from "@/app/actions/auth";
import { SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getUserById } from "@/lib/data";
import { hasUsablePassword } from "@/lib/demo-personas";
import { peekResetToken } from "@/lib/password-reset";
import { MIN_PASSWORD_LENGTH } from "@/lib/signup";
import { AuthShell } from "../../AuthShell";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.reset");
  return { title: `${t("title")} · Parcelith`, robots: { index: false }, referrer: "no-referrer" };
}

export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ token }, { error }, t] = await Promise.all([params, searchParams, getTranslations("auth.reset")]);
  const userId = await peekResetToken(token);
  const user = userId ? await getUserById(userId) : null;

  return (
    <AuthShell>
      <Card asChild>
        <section>
          <CardContent>
            {user ? (
              <>
                <h1 className="font-heading text-lg font-semibold tracking-tight text-foreground">
                  {hasUsablePassword(user) ? t("title") : t("inviteTitle")}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">{t("lead", { email: user.email })}</p>
                <form action={resetPassword} className="mt-6">
                  <input type="hidden" name="token" value={token} />
                  <input type="hidden" name="email" value={user.email} autoComplete="username" />
                  <Label htmlFor="reset-password">{t("password")}</Label>
                  <Input
                    id="reset-password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    maxLength={200}
                    className="mt-1.5"
                    aria-describedby="reset-password-hint"
                    aria-invalid={error === "password" ? true : undefined}
                  />
                  <p
                    id="reset-password-hint"
                    className={error === "password" ? "mt-1.5 text-xs text-destructive" : "mt-1.5 text-xs text-muted-foreground"}
                  >
                    {error === "password"
                      ? t("passwordError", { count: MIN_PASSWORD_LENGTH })
                      : t("passwordHint", { count: MIN_PASSWORD_LENGTH })}
                  </p>
                  <SubmitButton pendingLabel={t("saving")} className="mt-4 w-full">
                    {t("submit")}
                  </SubmitButton>
                </form>
              </>
            ) : (
              <>
                <h1 className="font-heading text-lg font-semibold tracking-tight text-foreground">{t("invalidTitle")}</h1>
                <p className="mt-2 text-sm text-muted-foreground">{t("invalidBody")}</p>
                <Button asChild variant="outline" size="sm" className="mt-5">
                  <Link href="/login/forgot">{t("requestNew")}</Link>
                </Button>
              </>
            )}
          </CardContent>
        </section>
      </Card>
    </AuthShell>
  );
}
