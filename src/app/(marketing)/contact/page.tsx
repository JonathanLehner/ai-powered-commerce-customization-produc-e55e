import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "./ContactForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Section } from "../kit";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Contact sales",
  description: "Get started with Parcelith or talk to sales about the Scale plan.",
};

export default function ContactPage() {
  return (
    <>
      <section className="border-b border-border">
        <div className="mx-auto w-full max-w-4xl px-4 py-14 sm:px-6 sm:py-20">
          <h1 className="font-heading text-[2rem] leading-[1.1] font-semibold tracking-tight text-foreground sm:text-5xl">
            Contact sales
          </h1>
          <p className="mt-4 max-w-[62ch] text-base text-muted-foreground sm:text-lg">
            Tell us about your agency and we will set up your workspace.
          </p>
        </div>
      </section>

      <Section>
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-10">
          <Card>
            <CardContent>
              <ContactForm />
            </CardContent>
          </Card>

          <Card size="sm">
            <CardContent>
              <h2 className="text-sm font-semibold text-foreground">Explore the demo</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">Four sample client stores with products and orders.</p>
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link href="/login">Open the demo</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </Section>
    </>
  );
}
