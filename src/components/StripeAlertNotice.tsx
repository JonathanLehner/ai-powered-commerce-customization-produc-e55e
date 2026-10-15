import { getLocale, getTranslations } from "next-intl/server";
import { Callout } from "@/components/ui";
import { currentStripeAlert } from "@/lib/stripe-alerts";
import { formatDateTime } from "@/lib/util";

/**
 * On the platform admin overview while Stripe refuses the platform account, as
 * Stripe worded it, with the Dashboard page to fix it on. It goes once a
 * Connect account can be created again.
 */
export async function StripeAlertNotice() {
  const alert = await currentStripeAlert();
  if (!alert) return null;
  const [t, locale] = await Promise.all([getTranslations("admin.stripeAlert"), getLocale()]);
  return (
    <Callout tone="rose" title={t("title")}>
      <p>{t("body")}</p>
      <p className="mt-2 font-medium">{alert.message}</p>
      <p className="mt-1 text-xs opacity-80">
        {alert.storeName
          ? t("seenWithStore", { when: formatDateTime(alert.lastSeenAt, locale), store: alert.storeName })
          : t("seen", { when: formatDateTime(alert.lastSeenAt, locale) })}
      </p>
      <p className="mt-2">
        <a href={alert.dashboardUrl} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
          {t("openDashboard")}
        </a>
      </p>
    </Callout>
  );
}
