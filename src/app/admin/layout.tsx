import type { Metadata } from "next";
import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { Document, siteMetadata } from "@/components/Document";
import { StoreNav } from "@/components/StoreNav";
import { Badge, Logo } from "@/components/ui";
import { requirePlatformAdmin } from "@/lib/session";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/suppliers", label: "Suppliers" },
  { href: "/admin/catalog", label: "Shared catalog" },
  { href: "/admin/quotes", label: "Quote requests" },
  { href: "/admin/tax", label: "Tax brackets" },
  { href: "/admin/agencies", label: "Agencies and access" },
  { href: "/admin/audit", label: "Audit log" },
];

export const metadata: Metadata = siteMetadata;

/** Root layout for platform administration. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePlatformAdmin();

  return (
    <Document>
      <div className="flex min-h-full flex-col bg-canvas">
        <header className="sticky top-0 z-40 border-b border-line bg-white">
          <div className="mx-auto flex h-14 w-full max-w-[92rem] items-center gap-3 px-4 sm:px-6">
            <Link href="/admin" aria-label="Parcelith platform administration">
              <Logo size={26} />
            </Link>
            <span className="hidden sm:inline-flex">
              <Badge tone="green">Platform administration</Badge>
            </span>
            <div className="ml-auto flex items-center gap-1 sm:gap-2">
              <Link href="/app" className="rounded-lg px-2 py-1.5 text-sm font-medium text-inksoft hover:bg-canvas sm:px-3">
                <span className="sm:hidden">Workspace</span>
                <span className="hidden sm:inline">Agency workspace</span>
              </Link>
              <span className="hidden text-sm text-muted sm:block">{user.name}</span>
              <form action={signOut}>
                <button type="submit" className="btn-secondary btn-sm">
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </header>
        <StoreNav items={NAV} />
        <div className="mx-auto w-full max-w-[92rem] flex-1 px-4 py-7 sm:px-6">{children}</div>
      </div>
    </Document>
  );
}
