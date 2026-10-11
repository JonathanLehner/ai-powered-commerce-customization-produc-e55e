"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FallbackPanel } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { storeBasePath } from "@/lib/util";

/** A failure part-way through working on a store, with the store chrome kept. */
export default function StoreWorkspaceError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const t = useTranslations("common");
  const fallback = useTranslations("fallback");
  const base = storeBasePath(usePathname());

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
            <Link href={base}>{fallback("backToStore")}</Link>
          </Button>
        </>
      }
      note={error.digest ? t("reference", { digest: error.digest }) : null}
    />
  );
}
