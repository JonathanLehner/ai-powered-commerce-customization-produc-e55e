import type { Metadata } from "next";
import { Document, siteMetadata } from "@/components/Document";

export const metadata: Metadata = siteMetadata;

/** Root layout for the sign-in screen. */
export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <Document>{children}</Document>;
}
