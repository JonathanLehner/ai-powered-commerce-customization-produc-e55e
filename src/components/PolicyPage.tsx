import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import { shopperIntl } from "@/i18n/storefront";
import { storeLanguages } from "@/i18n/storefront-routing";
import { POLICY_KEYS, policyBlocks, policyPath, storePolicyText, type PolicyKey } from "@/lib/policies";
import { storeSupport, supportMailto, supportTel } from "@/lib/support";
import type { Store } from "@/lib/types";
import { cn } from "@/lib/utils";

/** The text of a policy in the shopper's language: what the store wrote, else the built-in text. */
async function resolvePolicy(store: Store, key: PolicyKey, locale: Locale) {
  const { defaultLocale } = storeLanguages(store);
  const own = storePolicyText(store, key, locale, defaultLocale);
  if (own) return own;
  const builtIn = await getTranslations({ locale, namespace: "storePolicies" });
  return builtIn(key, { store: store.name });
}

/**
 * One of the store's policies, inside the storefront or gift portal chrome
 * (`root` is `/s/<slug>` or `/g/<slug>`), with the other three beside it.
 */
export async function PolicyPage({
  store,
  policy,
  locale: requested,
  root,
}: {
  store: Store;
  policy: PolicyKey;
  locale: string;
  root: string;
}) {
  const { locale, t, base } = await shopperIntl(store, requested, root);
  const blocks = policyBlocks(await resolvePolicy(store, policy, locale));
  const support = storeSupport(store);

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[12rem_1fr]">
      <nav aria-label={t("policies.title")} className="md:pt-2">
        <p className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">{t("policies.title")}</p>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm md:flex-col">
          {POLICY_KEYS.map((key) => (
            <li key={key}>
              <Link
                href={policyPath(base, key)}
                aria-current={key === policy ? "page" : undefined}
                className={cn(
                  "hover:text-foreground hover:underline",
                  key === policy ? "font-medium text-foreground" : "text-inksoft",
                )}
              >
                {t(`policies.${key}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <article className="min-w-0">
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">{t(`policies.${policy}`)}</h1>
        <div className="mt-6 max-w-2xl space-y-4 text-sm leading-relaxed text-inksoft">
          {blocks.map((block, index) =>
            block.type === "heading" ? (
              <h2 key={index} className="pt-4 font-heading text-base font-semibold text-foreground">
                {block.text}
              </h2>
            ) : (
              <p key={index} className="whitespace-pre-line">
                {block.text}
              </p>
            ),
          )}
        </div>

        {support.email || support.phone ? (
          <div className="mt-10 max-w-2xl border-t border-border pt-6 text-sm">
            <p className="font-medium text-foreground">{t("policies.questions")}</p>
            <ul className="mt-2 space-y-1 text-inksoft">
              {support.email ? (
                <li>
                  <span className="text-muted-foreground">{t("chrome.supportEmailLabel")}:</span>{" "}
                  <a href={supportMailto(support.email)} className="hover:text-foreground hover:underline">
                    {support.email}
                  </a>
                </li>
              ) : null}
              {support.phone ? (
                <li>
                  <span className="text-muted-foreground">{t("chrome.supportPhoneLabel")}:</span>{" "}
                  <a href={supportTel(support.phone)} className="hover:text-foreground hover:underline">
                    {support.phone}
                  </a>
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}
      </article>
    </div>
  );
}
