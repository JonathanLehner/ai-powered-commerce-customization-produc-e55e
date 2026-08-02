import type { Metadata } from "next";
import Link from "next/link";
import { signInAs } from "@/app/actions/auth";
import { Badge, Logo } from "@/components/ui";
import { LoginForm } from "./LoginForm";

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
    blurb: "Full control of four client stores: settings, team, catalog, orders and publishing.",
    tone: "brand" as const,
  },
  {
    email: "sam@northlight.studio",
    name: "Sam Okafor",
    title: "Catalog producer",
    blurb: "Catalog manager on Northwind and Lumen, store admin on Ferro. No access to Rivet.",
    tone: "iris" as const,
  },
  {
    email: "ines@northlight.studio",
    name: "Inés Duarte",
    title: "Fulfilment lead",
    blurb: "Order manager on Northwind only — orders and exceptions, read-only catalog.",
    tone: "amber" as const,
  },
  {
    email: "dana@northwind.example",
    name: "Dana Whitfield",
    title: "Client stakeholder",
    blurb: "Viewer on Northwind Supply Co. Can read, cannot change anything.",
    tone: "slate" as const,
  },
  {
    email: "ops@parcelith.com",
    name: "Priya Raman",
    title: "Platform operations",
    blurb: "Platform admin: suppliers, shared catalog, global tax brackets, agencies and access.",
    tone: "green" as const,
  },
];

export default function LoginPage() {
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

      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-8 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <section className="card h-fit p-6">
          <h1 className="text-xl font-semibold tracking-tight text-ink">Sign in</h1>
          <p className="mt-1.5 text-sm text-muted">
            Use a demo account to open the agency workspace.
          </p>
          <div className="mt-6">
            <LoginForm next="/app" />
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight text-ink">Or pick a role</h2>
          <p className="mt-1.5 text-sm text-muted">
            Each account shows a different slice of the platform. Store access and permissions are enforced
            per role, so what you can change depends on who you sign in as.
          </p>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {PERSONAS.map((persona) => (
              <li key={persona.email}>
                <form action={signInAs} className="card h-full p-4 transition hover:border-brand-300">
                  <input type="hidden" name="email" value={persona.email} />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{persona.name}</p>
                      <p className="truncate text-xs text-muted">{persona.title}</p>
                    </div>
                    <Badge tone={persona.tone}>{persona.email.split("@")[1]}</Badge>
                  </div>
                  <p className="mt-2.5 text-sm leading-relaxed text-inksoft">{persona.blurb}</p>
                  <button type="submit" className="btn-secondary btn-sm mt-4 w-full">
                    Continue as {persona.name.split(" ")[0]}
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-xs text-muted">
            Shopper storefronts are public — no sign-in needed. Open a store from the agency dashboard to
            browse, customise and check out as a customer would.
          </p>
        </section>
      </main>
    </div>
  );
}
