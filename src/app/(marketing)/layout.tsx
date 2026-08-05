import type { Metadata } from "next";
import { Document, siteMetadata } from "@/components/Document";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";

export const metadata: Metadata = siteMetadata;

/** Root layout for the public marketing pages. */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <Document>
      <div className="flex min-h-full flex-col">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </div>
    </Document>
  );
}
