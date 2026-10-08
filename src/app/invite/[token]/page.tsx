import type { Metadata } from "next";
import Link from "next/link";
import { acceptInvitation } from "@/app/actions/team";
import { SubmitButton } from "@/components/forms";
import { Badge, Logo } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getMembershipByToken, getStore } from "@/lib/data";
import { STORE_ROLE_DESCRIPTIONS, STORE_ROLE_LABELS } from "@/lib/types";
import { formatDate } from "@/lib/util";

export const metadata: Metadata = {
  title: "Accept your invitation",
  description: "Accept an invitation to work on a Parcelith store.",
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-muted">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/">
            <Logo />
          </Link>
          <Button asChild variant="ghost">
            <Link href="/how-it-works">How it works</Link>
          </Button>
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
        <Card asChild>
        <section>
          <CardContent>
            <h1 className="font-heading text-lg font-semibold tracking-tight text-foreground">
              This link is no longer valid
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              An acceptance link works once. If it has already been used, sign in with the email address it was
              sent to. Otherwise ask the person who invited you for a new link.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-5">
              <Link href="/login">Go to sign in</Link>
            </Button>
          </CardContent>
        </section>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <Card asChild>
      <section>
        <CardContent>
          <Badge tone="brand">{STORE_ROLE_LABELS[membership.role]}</Badge>
          <h1 className="font-heading mt-3 text-lg font-semibold tracking-tight text-foreground">
            {membership.invitedBy} invited you to {store.name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Accepting creates a Parcelith account for {membership.email} and signs you in.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{STORE_ROLE_LABELS[membership.role]}</span> —{" "}
            {STORE_ROLE_DESCRIPTIONS[membership.role]}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">Invited {formatDate(membership.invitedAt)}.</p>

          <form action={acceptInvitation} className="mt-6">
            <input type="hidden" name="token" value={token} />
            <SubmitButton pendingLabel="Setting up your account…" className="w-full">
              Accept invitation
            </SubmitButton>
          </form>
        </CardContent>
      </section>
      </Card>
    </Shell>
  );
}
