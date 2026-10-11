"use client";

import { useTranslations } from "next-intl";
import { FallbackPanel } from "@/components/ui";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/** An unexpected failure on the public site. */
export default function MarketingError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const t = useTranslations("common");
  return (
    <FallbackPanel
      eyebrow={t("error")}
      title={t("errorTitle")}
      description={<p>{t("errorBody")}</p>}
      actions={
        <>
          <Button type="button" onClick={unstable_retry}>
            {t("tryAgain")}
          </Button>
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            {t("backToHomepage")}
          </Link>
        </>
      }
      note={error.digest ? t("reference", { digest: error.digest }) : null}
    />
  );
}
