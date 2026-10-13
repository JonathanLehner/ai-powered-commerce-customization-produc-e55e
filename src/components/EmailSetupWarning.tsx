import { getTranslations } from "next-intl/server";
import { Callout } from "@/components/ui";
import { missingEmailSettings } from "@/lib/email";

/** Shown on the overviews while no email provider is configured, so the gap is not only in the activity log. */
export async function EmailSetupWarning() {
  const missing = missingEmailSettings();
  if (missing.length === 0) return null;
  const t = await getTranslations("emailSetup");
  return (
    <Callout tone="amber" title={t("title")}>
      <p>{t("body")}</p>
      <p className="mt-1">
        {t("missing")} <span className="font-mono text-xs">{missing.join(", ")}</span>
      </p>
    </Callout>
  );
}
