import type { Metadata } from "next";
import { siteMetadata } from "@/components/Document";
import { WorkspaceDocument } from "@/components/WorkspaceIntl";

export const metadata: Metadata = siteMetadata;

/** Root layout for team invitation links. */
export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return <WorkspaceDocument>{children}</WorkspaceDocument>;
}
