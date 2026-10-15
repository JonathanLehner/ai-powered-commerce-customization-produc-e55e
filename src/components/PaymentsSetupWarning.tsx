import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Callout } from "@/components/ui";
import { notTakingOrders } from "@/lib/payment-mode";
import { SETUP_STEPS, type Store } from "@/lib/types";

/**
 * Shown where products or the storefront are published while the store cannot
 * take payment, so the team knows shoppers will reach a closed checkout.
 * `canConnect` links to the Stripe step for people who can open settings.
 */
export async function PaymentsSetupWarning({
  store,
  canConnect,
}: {
  store: Pick<Store, "id" | "stripe" | "demo" | "status" | "testMode">;
  canConnect: boolean;
}) {
  if (!notTakingOrders(store)) return null;
  const t = await getTranslations("paymentsSetup");
  return (
    <Callout tone="amber" title={t("title")}>
      {t("body")}{" "}
      {canConnect ? (
        <Link
          href={`/app/stores/${store.id}/setup#step-${SETUP_STEPS.indexOf("payments") + 1}`}
          className="font-medium underline"
        >
          {t("connect")}
        </Link>
      ) : (
        <span>{t("adminCanConnect")}</span>
      )}
    </Callout>
  );
}
