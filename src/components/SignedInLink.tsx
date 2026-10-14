"use client";

import { useSyncExternalStore } from "react";
import { readSignedInHint } from "@/lib/signed-in-hint";

const noSubscription = () => () => {};

/**
 * A link on a prerendered page that leads somewhere else once the visitor has
 * signed in: "Sign in" becomes "Go to dashboard". The page is rendered for a
 * visitor who has not signed in, and switches after it loads.
 */
export function SignedInLink({
  href,
  label,
  signedInHref,
  signedInLabel = label,
  className,
}: {
  href: string;
  label: string;
  signedInHref: string;
  signedInLabel?: string;
  className?: string;
}) {
  const signedIn = useSyncExternalStore(noSubscription, readSignedInHint, () => false);
  return (
    <a href={signedIn ? signedInHref : href} className={className}>
      {signedIn ? signedInLabel : label}
    </a>
  );
}
