import { ArrowRightIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui";
import { ContactForm } from "./ContactForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Section } from "../kit";

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
      <section className="border-b border-border">
        <div className="mx-auto w-full max-w-4xl px-4 py-14 sm:px-6 sm:py-20">
          <Badge tone="brand">Get started</Badge>
          <h1 className="font-heading mt-4 max-w-[22ch] text-[2rem] leading-[1.1] font-semibold tracking-tight text-balance text-foreground sm:text-5xl">
            Tell us what you want to launch
          </h1>
          <p className="mt-5 max-w-[62ch] text-base leading-relaxed text-muted-foreground sm:text-lg">
            Starter and Studio workspaces are opened by us so your first client store is configured correctly
            from the outset — payments, carriers and tax included. Scale is an annual agreement, so that one
            always starts with a conversation. Say which you are after and we will take it from there.
          </p>
        </div>
      </section>

      <Section>
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-10">
          <Card>
            <CardHeader>
              <h2 className="font-heading text-lg font-semibold tracking-tight text-foreground">
                Send us the details
              </h2>
              <p className="text-sm text-muted-foreground">
                Nothing is charged today and no card is asked for.
              </p>
            </CardHeader>
            <CardContent>
              <ContactForm />
            </CardContent>
          </Card>

          <div className="space-y-4">
            <ol className="space-y-4">
              {NEXT_STEPS.map((item) => (
                <Card asChild key={item.step} size="sm">
                  <li>
                    <CardContent>
                      <span className="font-mono text-xs font-semibold text-muted-foreground">{item.step}</span>
                      <h3 className="mt-2 text-sm font-semibold text-foreground">{item.title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                    </CardContent>
                  </li>
                </Card>
              ))}
            </ol>

            <Card size="sm" className="bg-primary/5 ring-primary/20">
              <CardContent>
                <h2 className="text-sm font-semibold text-foreground">
                  Running a corporate gifting programme?
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  Gift catalogues, spend limits, bulk recipient lists and approver sign-off are on every plan.
                  Tell us how many companies and recipients you gift to and we will size the plan around it.
                </p>
                <Link
                  href="/how-it-works#gifting"
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  How gifting works
                  <ArrowRightIcon aria-hidden className="size-4" />
                </Link>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardContent>
                <h2 className="text-sm font-semibold text-foreground">Want to look around first?</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  The demo workspace is populated with four client stores, a supplier catalog, live artwork
                  pre-flight and a full order queue.
                </p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link href="/login">Open the demo workspace</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </Section>
    </>
  );
}
