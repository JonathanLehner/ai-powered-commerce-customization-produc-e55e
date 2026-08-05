import type { Metadata } from "next";
import { Document, siteMetadata } from "@/components/Document";

export const metadata: Metadata = siteMetadata;

/** Root layout for team invitation links. */
export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return <Document>{children}</Document>;
}
