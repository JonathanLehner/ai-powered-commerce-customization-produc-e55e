"use client";

import "@/app/globals.css";

/**
 * The last resort: a failure in one of the root layouts, before any header,
 * store or navigation exists. It replaces the document, so it renders its own
 * `<html>` and pulls in the stylesheet itself.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-white text-ink">
        <title>Something went wrong · Parcelith</title>
        <div className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6 sm:py-20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Parcelith" width={28} height={32} style={{ width: "auto", height: 32 }} />
          <p className="section-title mt-8">Error</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Something went wrong at our end
          </h1>
          <p className="mt-3 text-sm leading-6 text-inksoft">
            This page could not be loaded. Try again, and if it keeps happening come back in a few
            minutes.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-2.5">
            <button type="button" onClick={unstable_retry} className="btn-primary">
              Try again
            </button>
            {/* A full page load, not a client navigation: the router itself is part of what failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className="btn-secondary">
              Go to Parcelith
            </a>
          </div>
          {error.digest ? <p className="mt-8 text-xs text-muted">Reference {error.digest}</p> : null}
        </div>
      </body>
    </html>
  );
}
