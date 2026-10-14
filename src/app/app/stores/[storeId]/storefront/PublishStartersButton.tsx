"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { publishStarterProducts } from "@/app/actions/storefront";
import { Button } from "@/components/ui/button";

/** Publishes the template's suggested products in one click and says why any stayed back. */
export function PublishStartersButton({ storeId }: { storeId: string }) {
  const t = useTranslations("editor.starters");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ published: number; blockers: { reason: string; fix: string }[] } | { error: string } | null>(null);

  return (
    <div className="mt-3 space-y-2">
      <Button
        type="button"
        size="sm"
        disabled={pending}
        onClick={() => startTransition(async () => setResult(await publishStarterProducts({ storeId })))}
      >
        {pending ? t("publishing") : t("publish")}
      </Button>
      {result && "error" in result ? (
        <p role="alert">{result.error || t("failed")}</p>
      ) : result ? (
        <div role="status" className="space-y-1">
          {result.published > 0 ? <p>{t("published", { count: result.published })}</p> : null}
          {result.blockers.length > 0 ? (
            <>
              <p className="font-medium">{t("notPublished")}</p>
              <ul className="list-disc pl-5">
                {result.blockers.map(({ reason, fix }) => (
                  <li key={reason}>
                    {reason} {fix}
                  </li>
                ))}
              </ul>
              <Link href={`/app/stores/${storeId}/catalog`} className="font-medium underline underline-offset-4">
                {t("review")}
              </Link>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
