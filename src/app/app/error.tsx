"use client";

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
  return (
    <>
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-14 w-full max-w-[92rem] items-center px-4 sm:px-6">
          <Link href="/app" aria-label="Parcelith agency workspace">
            <Logo size={26} />
          </Link>
        </div>
      </header>
      <FallbackPanel
        eyebrow="Error"
        title="Something went wrong at our end"
        description={
          <p>
            This page could not be loaded. Nothing you had already saved is affected — try again,
            and if it keeps happening come back in a few minutes.
          </p>
        }
        actions={
          <>
            <Button type="button" onClick={unstable_retry}>
              Try again
            </Button>
            <Button asChild variant="outline">
              <Link href="/app">Go to the dashboard</Link>
            </Button>
          </>
        }
        note={error.digest ? `Reference ${error.digest}` : null}
      />
    </>
  );
}
