import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { siteMetadata } from "@/components/Document";
import { Toaster } from "@/components/ui/sonner";
import { WorkspaceDocument } from "@/components/WorkspaceIntl";
import { onTrial, trialDaysLeft } from "@/lib/billing";
import { getAgency } from "@/lib/data";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = siteMetadata;

/**
 * Root layout and auth boundary for the agency workspace. The header is rendered
 * per route so the store switcher can highlight the store the route belongs to.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const agency = user.agencyId ? await getAgency(user.agencyId) : null;
  return (
    <WorkspaceDocument>
      <div data-surface="workspace" className="flex min-h-full flex-col bg-canvas">
        {agency?.billing?.status === "past_due" ? <PastDueBanner owner={user.platformRole === "agency_admin"} /> : null}
        {onTrial(agency) && trialDaysLeft(agency) > 0 ? (
          <TrialBanner days={trialDaysLeft(agency)} owner={user.platformRole === "agency_admin"} />
        ) : null}
        {children}
      </div>
      {/* Light-only, so the toast never follows the visitor's OS to dark. */}
      <Toaster theme="light" position="bottom-right" />
    </WorkspaceDocument>
  );
}

/** Shown on every workspace page while the agency's plan payment has failed. */
async function PastDueBanner({ owner }: { owner: boolean }) {
  const t = await getTranslations("billing");
  return (
    <div role="status" className="border-b border-rose-200 bg-rose-50 px-4 py-2.5 text-center text-sm text-rose-900 sm:px-6">
      {t("pastDueBanner")}{" "}
      {owner ? (
        <Link href="/app/billing" className="font-medium underline underline-offset-2 hover:no-underline">
          {t("pastDueAction")}
        </Link>
      ) : (
        t("pastDueAskOwner")
      )}
    </div>
  );
}

/** Shown on every workspace page during the free trial, until payment details are added. */
async function TrialBanner({ days, owner }: { days: number; owner: boolean }) {
  const t = await getTranslations("billing");
  return (
    <div role="status" className="border-b border-border bg-primary/5 px-4 py-2.5 text-center text-sm text-foreground sm:px-6">
      {t("trialBanner", { days })}{" "}
      {owner ? (
        <Link href="/app/billing" className="font-medium underline underline-offset-2 hover:no-underline">
          {t("addPayment")}
        </Link>
      ) : null}
    </div>
  );
}
