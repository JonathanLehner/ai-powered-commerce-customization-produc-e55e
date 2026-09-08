import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Document, siteMetadata } from "@/components/Document";
import { PlainDocument } from "@/components/SiteChrome";
import { getGiftCatalogueBySlug, getStore } from "@/lib/data";
import { giftPortalMetadata } from "@/lib/storefront-meta";
import { storeSupport, supportMailto, supportTel } from "@/lib/support";
import { THEMES } from "@/lib/types";

/**
 * The portal is the client's, not Parcelith's: pages below it are suffixed with
 * the catalogue name and share as the catalogue, with the store logo. A link
 * that no longer resolves falls back to the platform's own metadata, matching
 * the chrome the 404 below renders.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const catalogue = await getGiftCatalogueBySlug(slug);
  const store = catalogue ? await getStore(catalogue.storeId) : null;
  if (!catalogue || !store) return { ...siteMetadata, robots: { index: false, follow: false } };
  return giftPortalMetadata(catalogue, store);
}

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
  // `children` keeps rendering: the pages below return the "not this address"
  // body themselves, so it is server-rendered into this chrome.
  if (!catalogue || !store) {
    return <PlainDocument note="Corporate gifting powered by Parcelith.">{children}</PlainDocument>;
  }

  const theme = THEMES[store.theme];
  // The same contacts the storefront publishes: a gifting buyer with a problem
  // has no other route to the seller either, and nothing here is invented from
  // the client's name.
  const support = storeSupport(store);

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
            {support.email || support.phone ? (
              <p className="mt-3">
                Questions about a campaign:{" "}
                {support.email ? (
                  <a href={supportMailto(support.email)} className="text-ink hover:underline">
                    {support.email}
                  </a>
                ) : null}
                {support.email && support.phone ? " · " : null}
                {support.phone ? (
                  <a href={supportTel(support.phone)} className="text-ink hover:underline">
                    {support.phone}
                  </a>
                ) : null}
              </p>
            ) : (
              <p className="mt-3">{store.clientName} has not published support contact details yet.</p>
            )}
            <p className="mt-3 text-xs">
              © {new Date().getFullYear()} {store.clientName}. Corporate gifting powered by Parcelith.
            </p>
          </div>
        </footer>
      </div>
    </Document>
  );
}
