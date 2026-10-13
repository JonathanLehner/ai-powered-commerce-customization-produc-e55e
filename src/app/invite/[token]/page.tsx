import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import Link from "next/link";
import { acceptInvitation } from "@/app/actions/team";
import { SubmitButton } from "@/components/forms";
import { Badge, Logo } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getMembershipByToken, getStore, getUserByEmail } from "@/lib/data";
import { hasUsablePassword } from "@/lib/demo-personas";
import { MIN_PASSWORD_LENGTH } from "@/lib/signup";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("invite");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

async function Shell({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("site");
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
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-10 sm:px-6 sm:py-14">{children}</main>
    </div>
  );
}

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ token }, { error }] = await Promise.all([params, searchParams]);
  const membership = await getMembershipByToken(token);
  const store = membership ? await getStore(membership.storeId) : null;
  const existing = membership ? await getUserByEmail(membership.email) : null;
  // A new account, or one invited before passwords were asked, chooses one here.
  const choosePassword = !existing || !hasUsablePassword(existing);
  const [t, roles, format] = await Promise.all([
    getTranslations("invite"),
    getTranslations("roles"),
    getFormatter(),
  ]);

  if (!membership || membership.status !== "invited" || !store) {
    return (
      <Shell>
        <Card asChild>
        <section>
          <CardContent>
            <h1 className="font-heading text-lg font-semibold tracking-tight text-foreground">
              {t("invalidTitle")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("invalidBody")}
            </p>
            <Button asChild variant="outline" size="sm" className="mt-5">
              <Link href="/login">{t("goToSignIn")}</Link>
            </Button>
          </CardContent>
        </section>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <Card asChild>
      <section>
        <CardContent>
          <Badge tone="brand">{roles(membership.role)}</Badge>
          <h1 className="font-heading mt-3 text-lg font-semibold tracking-tight text-foreground">
            {t("title", { inviter: membership.invitedBy, store: store.name })}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("creates", { email: membership.email })}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{roles(membership.role)}</span> ·{" "}
            {roles(`descriptions.${membership.role}`)}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("invited", { date: format.dateTime(new Date(membership.invitedAt), "date") })}
          </p>

          <form action={acceptInvitation} className="mt-6">
            <input type="hidden" name="token" value={token} />
            {choosePassword ? (
              <div className="mb-4">
                <Label htmlFor="invite-password">{t("password")}</Label>
                <Input
                  id="invite-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  maxLength={200}
                  className="mt-1.5"
                  aria-describedby="invite-password-hint"
                  aria-invalid={error === "password" ? true : undefined}
                />
                <p
                  id="invite-password-hint"
                  className={error === "password" ? "mt-1.5 text-xs text-destructive" : "mt-1.5 text-xs text-muted-foreground"}
                >
                  {error === "password"
                    ? t("passwordError", { count: MIN_PASSWORD_LENGTH })
                    : t("passwordHint", { count: MIN_PASSWORD_LENGTH })}
                </p>
              </div>
            ) : null}
            <SubmitButton pendingLabel={t("accepting")} className="w-full">
              {t("accept")}
            </SubmitButton>
          </form>
        </CardContent>
      </section>
      </Card>
    </Shell>
  );
}
