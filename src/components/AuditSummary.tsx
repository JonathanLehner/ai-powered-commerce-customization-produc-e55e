import Link from "next/link";
import { Fragment } from "react";
import { auditSummarySegments } from "@/lib/audit-log";
import type { Capability } from "@/lib/store-access";
import type { AuditLog } from "@/lib/types";

/**
 * Stands in for the summary inside a translated line such as "{summary} (3
 * times)", so the summary can be drawn with its links wherever the language
 * puts it.
 */
export const SUMMARY_SLOT = "";

/**
 * An audit entry's summary with each order, product, discount code, team member
 * and storefront version it names linked to that record in the same store.
 */
export function AuditSummary({
  entry,
  can,
  line,
}: {
  entry: AuditLog;
  /** What the viewer's role may open in the entry's store; nothing is linked when omitted. */
  can?: (capability: Capability) => boolean;
  /** A translated line holding `SUMMARY_SLOT`, e.g. the "repeated" wording. */
  line?: string;
}) {
  const summary = can
    ? auditSummarySegments(entry, can).map((segment, index) =>
        segment.href ? (
          <Link key={index} href={segment.href} className="font-medium text-primary hover:underline">
            {segment.text}
          </Link>
        ) : (
          <Fragment key={index}>{segment.text}</Fragment>
        ),
      )
    : entry.summary;
  if (!line) return <>{summary}</>;
  const [before, ...after] = line.split(SUMMARY_SLOT);
  return (
    <>
      {before}
      {summary}
      {after.join("")}
    </>
  );
}
