import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui";
import { ContactForm } from "./ContactForm";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Talk to us",
  description:
    "Start a Parcelith workspace on Starter or Studio, or arrange a call about the Scale agreement and corporate gifting programmes.",
};

const NEXT_STEPS = [
  {
    step: "01",
    title: "We reply within a working day",
    body: "A person reads every enquiry. If a plan you named is not the one that fits what you described, we will say so.",
  },
  {
    step: "02",
    title: "We open the workspace with you",
    body: "Your agency, your first client store, and the supplier catalog filtered to the products and fulfilment regions you sell into.",
  },
  {
    step: "03",
    title: "You launch the first store",
    body: "Branding, Stripe, carriers and tax, then artwork, mockups and a storefront. Gift catalogues whenever a client needs one.",
  },
];

export default function ContactPage() {
  return (
    <>
      <section className="border-b border-line bg-gradient-to-b from-brand-50/60 to-white">
        <div className="mx-auto w-full max-w-4xl px-4 py-14 sm:px-6 sm:py-20">
          <Badge tone="brand">Get started</Badge>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Tell us what you want to launch
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-inksoft">
            Starter and Studio workspaces are opened by us so your first client store is configured correctly
            from the outset — payments, carriers and tax included. Scale is an annual agreement, so that one
            always starts with a conversation. Say which you are after and we will take it from there.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="card p-6 sm:p-8">
            <h2 className="text-lg font-semibold tracking-tight text-ink">Send us the details</h2>
            <p className="mt-1.5 text-sm text-muted">
              Nothing is charged today and no card is asked for.
            </p>
            <div className="mt-6">
              <ContactForm />
            </div>
          </div>

          <div className="space-y-5">
            <ol className="space-y-4">
              {NEXT_STEPS.map((item) => (
                <li key={item.step} className="card p-5">
                  <span className="font-mono text-xs font-semibold text-brand-600">{item.step}</span>
                  <h3 className="mt-2 text-sm font-semibold text-ink">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{item.body}</p>
                </li>
              ))}
            </ol>

            <div className="rounded-2xl border border-brand-200 bg-brand-50 p-5">
              <h2 className="text-sm font-semibold text-ink">Running a corporate gifting programme?</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-inksoft">
                Gift catalogues, spend limits, bulk recipient lists and approver sign-off are on every plan.
                Tell us how many companies and recipients you gift to and we will size the plan around it.
              </p>
              <Link href="/how-it-works#gifting" className="mt-3 inline-flex text-sm font-medium text-brand-700 hover:underline">
                How gifting works →
              </Link>
            </div>

            <div className="card-pad">
              <h2 className="text-sm font-semibold text-ink">Want to look around first?</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-inksoft">
                The demo workspace is populated with four client stores, a supplier catalog, live artwork
                pre-flight and a full order queue.
              </p>
              <Link href="/login" className="btn-secondary btn-sm mt-3 inline-flex">
                Open the demo workspace
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
