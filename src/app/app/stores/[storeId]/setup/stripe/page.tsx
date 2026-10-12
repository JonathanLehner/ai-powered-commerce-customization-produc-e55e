import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Callout, PageHeader } from "@/components/ui";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { applyConnectStatus } from "@/lib/connect";
import { recordAudit } from "@/lib/data";
import { requireStoreAccess } from "@/lib/session";
import { retrieveAccount } from "@/lib/stripe";
import { ConnectStatusList, ConnectStripeForm } from "../ConnectStripe";

/**
 * Where Stripe's hosted onboarding returns to. Reaching it says nothing about
 * the account, so the account is read back from Stripe and its charges and
 * payouts state shown as Stripe reports it.
 */
export default async function StripeReturnPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const { user, store: loaded } = await requireStoreAccess(storeId, "store.settings");
  const t = await getTranslations("settings");

  let store = loaded;
  let unreadable = false;
  if (store.stripe.express && store.stripe.accountId) {
    const status = await retrieveAccount(store.stripe.accountId);
    if (status) {
      store = await applyConnectStatus(store, status, user);
      recordAudit({
        category: "store_setup",
        action: "store.stripe_onboarding_returned",
        summary: `Returned from Stripe onboarding for ${status.accountId}`,
        storeId,
        agencyId: store.agencyId,
        actorId: user.id,
        actorName: user.name,
        entity: "store",
        entityId: storeId,
        meta: { accountId: status.accountId, chargesEnabled: status.chargesEnabled, payoutsEnabled: status.payoutsEnabled },
      });
    } else {
      unreadable = true;
    }
  }
  const express = Boolean(store.stripe.express && store.stripe.accountId);
  const ready = express && store.stripe.chargesEnabled && store.stripe.payoutsEnabled;

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title={t("stripe")} />
      {unreadable ? <Callout tone="amber">{t("stripeUnreadable")}</Callout> : null}
      <Card>
        <CardContent className="space-y-4">
          {express ? (
            <>
              <p className="text-sm text-foreground">{ready ? t("stripeReady") : t("stripeIncomplete")}</p>
              <ConnectStatusList stripe={store.stripe} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("stripeDescription")}</p>
          )}
          {ready ? null : <ConnectStripeForm store={store} />}
        </CardContent>
      </Card>
      <Link href={`/app/stores/${storeId}/setup#step-6`} className={buttonVariants({ variant: "outline", size: "sm" })}>
        {t("backToSettings")}
      </Link>
    </div>
  );
}
