import type { Metadata } from "next";
import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { getTranslations } from "next-intl/server";
import { siteMetadata } from "@/components/Document";
import { StoreNav } from "@/components/StoreNav";
import { Badge, Logo } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { WorkspaceDocument } from "@/components/WorkspaceIntl";
import { requirePlatformAdmin } from "@/lib/session";

const NAV = [
  { href: "/admin", section: "overview" },
  { href: "/admin/suppliers", section: "suppliers" },
  { href: "/admin/catalog", section: "catalog" },
  { href: "/admin/quotes", section: "quotes" },
  { href: "/admin/tax", section: "tax" },
  { href: "/admin/agencies", section: "agencies" },
  { href: "/admin/audit", section: "audit" },
] as const;

export const metadata: Metadata = siteMetadata;

/** Root layout for platform administration. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePlatformAdmin();
  const t = await getTranslations("shell");

  return (
    <WorkspaceDocument>
      <div data-surface="workspace" className="flex min-h-full flex-col bg-muted">
        <header className="sticky top-0 z-40 border-b border-border bg-background">
          <div className="mx-auto flex h-14 w-full max-w-[92rem] items-center gap-2 px-4 sm:gap-3 sm:px-6">
            <Link href="/admin" className="shrink-0" aria-label={t("adminHome")}>
              <Logo size={26} />
            </Link>
            <Separator orientation="vertical" className="hidden h-5! sm:block" />
            <span className="hidden sm:inline-flex">
              <Badge tone="green">{t("platformAdministration")}</Badge>
            </span>
            <div className="ml-auto flex items-center gap-1 sm:gap-2">
              <Button asChild variant="ghost">
                <Link href="/app">
                  <span className="sm:hidden">{t("workspace")}</span>
                  <span className="hidden sm:inline">{t("agencyWorkspace")}</span>
                </Link>
              </Button>
              <span className="hidden text-sm text-muted-foreground sm:block">{user.name}</span>
              <form action={signOut}>
                <Button type="submit" variant="outline" size="sm">
                  {t("signOut")}
                </Button>
              </form>
            </div>
          </div>
        </header>
        <StoreNav
          label={t("platformAdministration")}
          items={NAV.map(({ href, section }) => ({ href, section, label: t(`adminTabs.${section}`) }))}
        />
        <div className="mx-auto w-full max-w-[92rem] flex-1 px-4 py-7 sm:px-6">{children}</div>
      </div>
    </WorkspaceDocument>
  );
}
