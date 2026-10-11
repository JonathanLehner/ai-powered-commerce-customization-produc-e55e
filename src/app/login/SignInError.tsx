"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Callout } from "@/components/ui";

const MESSAGES = {
  "unknown-user": "unknownUser",
  "bad-credentials": "badCredentials",
  // Auth.js's own name for the same thing, used when its endpoint is posted to directly.
  CredentialsSignin: "badCredentials",
} as const;

/**
 * Read on the client, so the page itself does not depend on the query string;
 * only the failed attempt carries one.
 */
export function SignInError() {
  const t = useTranslations("auth");
  const error = useSearchParams().get("error") ?? "";
  const key = error in MESSAGES ? MESSAGES[error as keyof typeof MESSAGES] : null;
  if (!key) return null;
  return (
    <div className="mt-5">
      <Callout tone="amber" title={t("failed")}>
        {t(`errors.${key}`)}
      </Callout>
    </div>
  );
}
