import type { ReactNode } from "react";
import { Callout } from "@/components/ui";
import type { shopperIntl } from "@/i18n/storefront";
import { storeSupport, supportMailto, supportTel } from "@/lib/support";
import type { Store } from "@/lib/types";

/**
 * What the basket and checkout show while the store cannot take payment: that
 * ordering is closed, and how to reach the seller instead.
 */
export function CheckoutClosed({
  store,
  t,
  children,
}: {
  store: Pick<Store, "name" | "supportEmail" | "supportPhone">;
  t: Awaited<ReturnType<typeof shopperIntl>>["t"];
  children?: ReactNode;
}) {
  const support = storeSupport(store);
  return (
    <Callout tone="amber" title={t("checkout.unavailableTitle")}>
      <p>{t("checkout.unavailableBody")}</p>
      {support.email || support.phone ? (
        <>
          <p className="mt-2">{t("checkout.unavailableContact", { store: store.name })}</p>
          <ul className="mt-1 space-y-1">
            {support.email ? (
              <li>
                {t("chrome.supportEmailLabel")}:{" "}
                <a href={supportMailto(support.email)} className="font-medium underline">
                  {support.email}
                </a>
              </li>
            ) : null}
            {support.phone ? (
              <li>
                {t("chrome.supportPhoneLabel")}:{" "}
                <a href={supportTel(support.phone)} className="font-medium underline">
                  {support.phone}
                </a>
              </li>
            ) : null}
          </ul>
        </>
      ) : null}
      {children}
    </Callout>
  );
}
