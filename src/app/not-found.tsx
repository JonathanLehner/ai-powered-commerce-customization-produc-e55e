import type { Metadata } from "next";
import Link from "next/link";
import { Document } from "@/components/Document";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { FallbackPanel } from "@/components/ui";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Page not found · Parcelith",
  description: "This page does not exist.",
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
            title="Page not found"
            description={
              <p>
                Check the address and try again.
              </p>
            }
            actions={
              <>
                <Link href="/" className={buttonVariants()}>
                  Back to the homepage
                </Link>
                <Link href="/how-it-works" className={buttonVariants({ variant: "outline" })}>
                  How it works
                </Link>
                <Link href="/login" className={buttonVariants({ variant: "outline" })}>
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
