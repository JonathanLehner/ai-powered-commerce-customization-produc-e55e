"use client";

import Link from "next/link";
import { FallbackPanel, Logo } from "@/components/ui";

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
      <header className="border-b border-line bg-white">
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
            <button type="button" onClick={unstable_retry} className="btn-primary">
              Try again
            </button>
            <Link href="/app" className="btn-secondary">
              Go to the dashboard
            </Link>
          </>
        }
        note={error.digest ? `Reference ${error.digest}` : null}
      />
    </>
  );
}
