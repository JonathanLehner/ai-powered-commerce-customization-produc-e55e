import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { signInAs, signInWithPassword } from "@/app/actions/auth";
import { Badge, Logo } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SignInError } from "./SignInError";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to the Parcelith agency workspace.",
};

const PERSONAS = [
  {
    email: "alex@northlight.studio",
    name: "Alex Moreau",
    title: "Agency director, Northlight Studio",
    blurb: "Full access to four client stores.",
    tone: "brand" as const,
  },
  {
    email: "sam@northlight.studio",
    name: "Sam Okafor",
    title: "Catalog producer",
    blurb: "Catalog manager on Northwind and Lumen, store admin on Ferro.",
    tone: "iris" as const,
  },
  {
    email: "ines@northlight.studio",
    name: "Inés Duarte",
    title: "Fulfilment lead",
    blurb: "Order manager on Northwind.",
    tone: "amber" as const,
  },
  {
    email: "dana@northwind.example",
    name: "Dana Whitfield",
    title: "Client stakeholder",
    blurb: "Read-only access to Northwind Supply Co.",
    tone: "slate" as const,
  },
  {
    email: "ops@parcelith.com",
    name: "Priya Raman",
    title: "Platform operations",
    blurb: "Suppliers, shared catalog, tax brackets and agencies.",
    tone: "green" as const,
  },
];

export default function LoginPage() {
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

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <section>
          <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">
            Sign in
          </h1>
                    <p className="mt-1.5 text-sm text-muted-foreground">Choose a demo account.</p>
          <Suspense fallback={null}>
            <SignInError />
          </Suspense>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {PERSONAS.map((persona) => (
              <li key={persona.email}>
                <Card asChild size="sm" className="h-full transition hover:ring-primary/30">
                <form action={signInAs}>
                    <input type="hidden" name="email" value={persona.email} />
                    <CardContent>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">{persona.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{persona.title}</p>
                        </div>
                        <Badge tone={persona.tone}>{persona.email.split("@")[1]}</Badge>
                      </div>
                      <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{persona.blurb}</p>
                      <Button type="submit" variant="outline" size="sm" className="mt-4 w-full">
                        Continue as {persona.name.split(" ")[0]}
                      </Button>
                    </CardContent>
                </form>
                </Card>
              </li>
            ))}
          </ul>
          <Card asChild size="sm" className="mt-6">
          <form action={signInWithPassword}>
              <CardHeader>
                <p className="text-sm font-semibold text-foreground">Sign in with a password</p>
                <p className="text-xs text-muted-foreground">
                  Every demo account uses the password <code className="font-mono">parcelith</code>.
                </p>
              </CardHeader>
              <CardContent className="flex flex-wrap items-end gap-2">
                <div className="grid content-start gap-1.5">
                  <Label htmlFor="password-email">Email address</Label>
                  <Input
                    id="password-email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    required
                    placeholder="name@company.com"
                    className="w-full sm:w-64"
                  />
                </div>
                <div className="grid content-start gap-1.5">
                  <Label htmlFor="password-password">Password</Label>
                  <Input
                    id="password-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    className="w-full sm:w-48"
                  />
                </div>
                <Button type="submit" variant="outline" size="sm">
                  Sign in
                </Button>
              </CardContent>
          </form>
          </Card>

          <Card asChild size="sm" className="mt-4">
          <form action={signInAs}>
              <CardContent>
                <Label htmlFor="signin-email">
                  Sign in with an invited email address
                </Label>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Input
                    id="signin-email"
                    name="email"
                    type="email"
                    required
                    placeholder="name@company.com"
                    className="w-full sm:w-72"
                  />
                  <Button type="submit" variant="outline" size="sm">
                    Continue
                  </Button>
                </div>
              </CardContent>
          </form>
          </Card>

          
        </section>
      </main>
    </div>
  );
}
