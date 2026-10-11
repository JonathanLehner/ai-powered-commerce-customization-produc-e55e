import type { Metadata } from "next";
import { siteMetadata } from "@/components/Document";
import { WorkspaceDocument } from "@/components/WorkspaceIntl";

export const metadata: Metadata = siteMetadata;

/** Root layout for the sign-in screen. */
export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <WorkspaceDocument>{children}</WorkspaceDocument>;
}
