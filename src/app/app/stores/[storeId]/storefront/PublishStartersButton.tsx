"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { bulkUpdateProducts } from "@/app/actions/products";
import { publishStarterProducts, type SkippedStarter } from "@/app/actions/storefront";
import { Button } from "@/components/ui/button";

/**
 * Approves and publishes the template's suggested products, with the same
 * rules as the catalog's bulk actions, and says why any stayed back.
 */
export function PublishStartersButton({
  storeId,
  productIds,
  toApprove,
  publishable,
  holdups,
}: {
  storeId: string;
  productIds: string[];
  /** How many have mockups waiting for approval. */
  toApprove: number;
  /** How many can be published now. */
  publishable: number;
  /** Why Publish is greyed out, when it is. */
  holdups: string;
}) {
  const t = useTranslations("editor.starters");
  const bulk = useTranslations("catalog.bulk");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<
    | { published: number; skipped: SkippedStarter[] }
    | { approved: number }
    | { error: string }
    | null
  >(null);

  function approve() {
    if (pending) return;
    startTransition(async () => {
      try {
        const outcome = await bulkUpdateProducts(storeId, productIds, { kind: "approve" });
        setResult(outcome.error ? { error: outcome.error } : { approved: outcome.succeeded.length });
      } catch {
        setResult({ error: "" });
      }
      router.refresh();
    });
  }

  function publish() {
    if (pending) return;
    startTransition(async () => {
      setResult(await publishStarterProducts({ storeId }));
      router.refresh();
    });
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {toApprove > 0 ? (
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={approve}>
            {bulk("approve")}
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          disabled={pending || publishable === 0}
          aria-describedby={holdups ? "starter-publish-holdups" : undefined}
          onClick={publish}
        >
          {pending ? t("publishing") : t("publish")}
        </Button>
        {holdups ? (
          <span id="starter-publish-holdups" className="text-xs">
            {holdups}
          </span>
        ) : null}
      </div>
      {result && "error" in result ? (
        <p role="alert">{result.error || t("failed")}</p>
      ) : result && "approved" in result ? (
        <p role="status">{bulk("result.approve", { count: result.approved })}</p>
      ) : result ? (
        <div role="status" className="space-y-1">
          {result.published > 0 ? <p>{t("published", { count: result.published })}</p> : null}
          {result.skipped.length > 0 ? (
            <>
              <p className="font-medium">{t("notPublished")}</p>
              <ul className="list-disc pl-5">
                {result.skipped.map(({ id, name, blockers }) => (
                  <li key={id}>
                    <Link href={`/app/stores/${storeId}/catalog/${id}`} className="font-medium underline underline-offset-4">
                      {name}
                    </Link>
                    :{" "}
                    {blockers.map(({ reason, fix }) => `${reason} ${fix}`.trim()).join(" ")}
                    {blockers.some((b) => b.code === "belowCost") ? (
                      <>
                        {" "}
                        <Link
                          href={`/app/stores/${storeId}/catalog/${id}#price`}
                          className="font-medium underline underline-offset-4"
                        >
                          {t("editPrice")}
                        </Link>
                      </>
                    ) : null}
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
