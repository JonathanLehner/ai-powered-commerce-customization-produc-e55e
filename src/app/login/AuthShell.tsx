import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Logo } from "@/components/ui";
import { Button } from "@/components/ui/button";

/** The header and narrow column of the password reset screens. */
export async function AuthShell({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("auth");
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
