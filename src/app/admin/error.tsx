"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { FallbackPanel } from "@/components/ui";
import { Button } from "@/components/ui/button";

/** A failure inside platform administration. */
export default function AdminError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const t = useTranslations("common");
  const fallback = useTranslations("fallback");
  return (
    <FallbackPanel
      eyebrow={t("error")}
      title={t("errorTitle")}
      description={
        <p>{t("errorBody")}</p>
      }
      actions={
        <>
          <Button type="button" onClick={unstable_retry}>
            {t("tryAgain")}
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin">{fallback("platformOverview")}</Link>
          </Button>
        </>
      }
      note={error.digest ? t("reference", { digest: error.digest }) : null}
    />
  );
}
