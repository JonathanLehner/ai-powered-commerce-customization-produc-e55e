import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Document, siteMetadata } from "@/components/Document";
import { PlainDocument } from "@/components/SiteChrome";
import { getGiftCatalogueBySlug, getStore } from "@/lib/data";
import { THEMES } from "@/lib/types";

export const metadata: Metadata = siteMetadata;

/**
 * Root layout for a company's private gift portal. Unlike the client storefront
 * this is a buyer-and-approver workflow rather than shopper-facing retail copy,
 * so it stays in English regardless of the store's storefront language.
 *
 * It carries the store's branding
 * because the store is the merchant of record here too, but it is never linked
 * from the public storefront: everyone arrives holding a link or an invitation.
 */
export default async function GiftPortalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const catalogue = await getGiftCatalogueBySlug(slug);
  const store = catalogue ? await getStore(catalogue.storeId) : null;

  // A portal link that no longer resolves still gets a page with a way out.
  // `children` keeps rendering: the pages below call `notFound()`, which is what
  // makes this a 404 and shows `not-found.tsx` in the main area.
  if (!catalogue || !store) {
    return <PlainDocument note="Corporate gifting powered by Parcelith.">{children}</PlainDocument>;
  }

  const theme = THEMES[store.theme];

  return (
    <Document>
      <div className="flex min-h-full flex-col bg-white">
        <header className="border-b border-line bg-white">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
            <Link href={`/g/${catalogue.slug}`} className="flex min-w-0 items-center gap-2.5">
              {store.logoUrl ? (
                <Image
                  src={store.logoUrl}
                  alt=""
                  width={40}
                  height={40}
                  sizes="40px"
                  className="h-9 w-9 shrink-0 rounded object-contain"
                />
              ) : (
                <span
                  aria-hidden
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-sm font-bold text-white"
                  style={{ background: theme.accent }}
                >
                  {store.name.slice(0, 1)}
                </span>
              )}
              <span className="min-w-0">
                <span className="block truncate text-base font-semibold tracking-tight text-ink">
                  {catalogue.companyName}
                </span>
                <span className="block truncate text-xs text-muted">Gift catalogue · {store.name}</span>
              </span>
            </Link>
            <span className="ml-auto rounded-full border border-line bg-canvas px-2.5 py-0.5 text-xs font-medium text-inksoft">
              Private
            </span>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-line bg-canvas">
          <div className="mx-auto w-full max-w-6xl px-4 py-8 text-sm text-muted sm:px-6">
            <p className="text-ink">{catalogue.name}</p>
            <p className="mt-1">
              Operated by {store.clientName}, who is the merchant of record. Gifts are made to order and shipped to
              each recipient individually.
            </p>
            <p className="mt-3 text-xs">
              © {new Date().getFullYear()} {store.clientName}. Corporate gifting powered by Parcelith.
            </p>
          </div>
        </footer>
      </div>
    </Document>
  );
}
