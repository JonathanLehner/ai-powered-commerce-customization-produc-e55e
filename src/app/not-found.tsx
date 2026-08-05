import type { Metadata } from "next";
import Link from "next/link";
import { Document } from "@/components/Document";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { FallbackPanel } from "@/components/ui";

export const metadata: Metadata = {
  title: "Page not found · Parcelith",
  description: "That address is not part of the Parcelith site.",
};

/**
 * The site-wide 404, for an address that matches no route at all.
 *
 * It is a root layout of its own — an unmatched address never reaches any of
 * the app's layouts — so it renders the document itself and borrows the public
 * site's header and footer. Being prerendered, the HTML arrives complete and
 * with a 404 status, and needs no JavaScript to read.
 */
export default function RootNotFound() {
  return (
    <Document>
      <div className="flex min-h-full flex-col">
        <SiteHeader />
        <main className="flex-1">
          <FallbackPanel
            eyebrow="404"
            title="We cannot find that page"
            description={
              <p>
                The address may be mistyped, or the page may have moved. Client shops live at their
                own addresses, so a shop link that no longer works is worth checking with the
                business that sent it.
              </p>
            }
            actions={
              <>
                <Link href="/" className="btn-primary">
                  Back to the homepage
                </Link>
                <Link href="/how-it-works" className="btn-secondary">
                  How it works
                </Link>
                <Link href="/login" className="btn-secondary">
                  Sign in
                </Link>
              </>
            }
          />
        </main>
        <SiteFooter />
      </div>
    </Document>
  );
}
