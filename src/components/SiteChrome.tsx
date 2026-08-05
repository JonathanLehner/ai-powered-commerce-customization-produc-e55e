import Link from "next/link";
import { Document } from "@/components/Document";
import { Logo } from "@/components/ui";

/**
 * The public Parcelith header and footer.
 *
 * They live here rather than inside the marketing layout because the site-wide
 * not-found page is a root layout of its own — an unmatched address never
 * reaches the marketing layout — and it has to look like the same site.
 */

const NAV = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-600"
        >
          <Logo />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-2.5 py-2 text-sm font-medium text-inksoft hover:bg-canvas hover:text-ink sm:px-3"
            >
              {item.label}
            </Link>
          ))}
          <Link href="/login" className="btn-primary btn-sm ml-1 sm:ml-2 sm:px-4 sm:py-2 sm:text-sm">
            Sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-canvas">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-3 max-w-sm text-sm text-muted">
            Parcelith is the commerce operating system agencies use to launch, customise and run branded
            product stores for every client — from artwork pre-flight to tracked delivery.
          </p>
        </div>
        <div>
          <h2 className="section-title">Platform</h2>
          <ul className="mt-3 space-y-2 text-sm text-inksoft">
            <li><Link href="/how-it-works" className="hover:text-ink hover:underline">How it works</Link></li>
            <li><Link href="/pricing" className="hover:text-ink hover:underline">Pricing</Link></li>
            <li><Link href="/login" className="hover:text-ink hover:underline">Sign in</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="section-title">Legal</h2>
          <ul className="mt-3 space-y-2 text-sm text-inksoft">
            <li><Link href="/legal/terms" className="hover:text-ink hover:underline">Terms of service</Link></li>
            <li><Link href="/legal/privacy" className="hover:text-ink hover:underline">Privacy notice</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-5 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} Parcelith. Sellers are the merchant of record for their own stores.</p>
          <p>Production partners: Printful · Gelato · Printify · Alibaba.com sourcing</p>
        </div>
      </div>
    </footer>
  );
}

/**
 * A whole document with Parcelith's mark and nothing else, used by the
 * storefront and gift portal layouts when the address in the URL resolves to no
 * shop or catalogue. Those layouts are root layouts, so the fallback has to be a
 * document too — and it must keep rendering `children`, because the page below
 * is what raises the 404.
 */
export function PlainDocument({ note, children }: { note: string; children: React.ReactNode }) {
  return (
    <Document>
      <div className="flex min-h-full flex-col bg-white">
        <header className="border-b border-line bg-white">
          <div className="mx-auto flex w-full max-w-6xl items-center px-4 py-3 sm:px-6">
            <Link href="/" aria-label="Parcelith">
              <Logo />
            </Link>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-line bg-canvas">
          <p className="mx-auto w-full max-w-6xl px-4 py-6 text-xs text-muted sm:px-6">{note}</p>
        </footer>
      </div>
    </Document>
  );
}
