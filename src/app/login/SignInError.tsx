"use client";

import { useSearchParams } from "next/navigation";
import { Callout } from "@/components/ui";

const MESSAGES: Record<string, string> = {
  "unknown-user": "No account uses that email address. Pick one of the accounts above instead.",
  "bad-credentials": "That email address and password do not match an account.",
  // Auth.js's own name for the same thing, used when its endpoint is posted to directly.
  CredentialsSignin: "That email address and password do not match an account.",
};

/**
 * Read on the client so /login stays prerendered — the page shows the same
 * account list to everyone, and only the failed attempt carries a query string.
 */
export function SignInError() {
  const message = MESSAGES[useSearchParams().get("error") ?? ""];
  if (!message) return null;
  return (
    <div className="mt-5">
      <Callout tone="amber" title="Sign-in failed">
        {message}
      </Callout>
    </div>
  );
}
