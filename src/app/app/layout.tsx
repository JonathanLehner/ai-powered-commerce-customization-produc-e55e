import type { Metadata } from "next";
import { Document, siteMetadata } from "@/components/Document";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = siteMetadata;

/**
 * Root layout and auth boundary for the agency workspace. The header is rendered
 * per route so the store switcher can highlight the store the route belongs to.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <Document>
      <div className="flex min-h-full flex-col bg-canvas">{children}</div>
    </Document>
  );
}
