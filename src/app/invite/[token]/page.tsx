import type { Metadata } from "next";
import Link from "next/link";
import { acceptInvitation } from "@/app/actions/team";
import { SubmitButton } from "@/components/forms";
import { Badge, Logo } from "@/components/ui";
import { getMembershipByToken, getStore } from "@/lib/data";
import { STORE_ROLE_DESCRIPTIONS, STORE_ROLE_LABELS } from "@/lib/types";
import { formatDate } from "@/lib/util";

export const metadata: Metadata = {
  title: "Accept your invitation",
  description: "Accept an invitation to work on a Parcelith store.",
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/">
            <Logo />
          </Link>
          <Link href="/how-it-works" className="text-sm font-medium text-inksoft hover:text-ink">
            How it works
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-10 sm:px-6 sm:py-14">{children}</main>
    </div>
  );
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const membership = await getMembershipByToken(token);
  const store = membership ? await getStore(membership.storeId) : null;

  if (!membership || membership.status !== "invited" || !store) {
    return (
      <Shell>
        <section className="card p-6">
          <h1 className="text-lg font-semibold tracking-tight text-ink">This link is no longer valid</h1>
          <p className="mt-2 text-sm text-muted">
            An acceptance link works once. If it has already been used, sign in with the email address it was
            sent to. Otherwise ask the person who invited you for a new link.
          </p>
          <Link href="/login" className="btn-secondary btn-sm mt-5 inline-flex">
            Go to sign in
          </Link>
        </section>
      </Shell>
    );
  }

  return (
    <Shell>
      <section className="card p-6">
        <Badge tone="brand">{STORE_ROLE_LABELS[membership.role]}</Badge>
        <h1 className="mt-3 text-lg font-semibold tracking-tight text-ink">
          {membership.invitedBy} invited you to {store.name}
        </h1>
        <p className="mt-2 text-sm text-muted">
          Accepting creates a Parcelith account for {membership.email} and signs you in.
        </p>
        <p className="mt-2 text-sm text-inksoft">
          <span className="font-medium text-ink">{STORE_ROLE_LABELS[membership.role]}</span> —{" "}
          {STORE_ROLE_DESCRIPTIONS[membership.role]}
        </p>
        <p className="mt-2 text-xs text-muted">Invited {formatDate(membership.invitedAt)}.</p>

        <form action={acceptInvitation} className="mt-6">
          <input type="hidden" name="token" value={token} />
          <SubmitButton pendingLabel="Setting up your account…" className="btn-primary w-full">
            Accept invitation
          </SubmitButton>
        </form>
      </section>
    </Shell>
  );
}
