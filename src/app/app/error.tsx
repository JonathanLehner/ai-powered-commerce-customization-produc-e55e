"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { FallbackPanel, Logo } from "@/components/ui";
import { Button } from "@/components/ui/button";

/**
 * A failure anywhere in the workspace. The header needs the signed-in user, and
 * an error boundary is a client component with no access to that, so this shows
 * the Parcelith mark and a way back into the workspace instead.
 */
export default function WorkspaceError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const t = useTranslations("common");
  const fallback = useTranslations("fallback");
  const shell = useTranslations("shell");
  return (
    <>
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-14 w-full max-w-[92rem] items-center px-4 sm:px-6">
          <Link href="/app" aria-label={shell("workspaceHome")}>
            <Logo size={26} />
          </Link>
        </div>
      </header>
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
              <Link href="/app">{fallback("goToDashboard")}</Link>
            </Button>
          </>
        }
        note={error.digest ? t("reference", { digest: error.digest }) : null}
      />
    </>
  );
}
