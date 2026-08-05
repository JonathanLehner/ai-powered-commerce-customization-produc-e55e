import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "@/app/globals.css";

/**
 * The shared `<html>`/`<body>` shell.
 *
 * The app has several root layouts rather than one, because the page language is
 * an attribute of `<html>` and only a root layout can render it: a client
 * storefront has to be marked with its own store's language, not the workspace's
 * English. Every root layout renders this component so the fonts, the global
 * stylesheet and the body classes stay in one place.
 */

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** Shared by every root layout, so the title template is identical across them. */
export const siteMetadata: Metadata = {
  title: {
    default: "Parcelith — the operating system for product commerce",
    template: "%s · Parcelith",
  },
  description:
    "Parcelith lets agencies launch and run branded merch stores for every client: isolated storefronts, a shared print-on-demand catalog, an artwork configurator with supplier pre-flight, and end-to-end fulfilment.",
  openGraph: {
    title: "Parcelith — the operating system for product commerce",
    description:
      "Launch isolated client stores, customise supplier-backed apparel and mugs, and route paid orders straight into production.",
    type: "website",
  },
};

export function Document({
  lang = "en",
  children,
}: {
  /** BCP-47 tag announced to browsers and screen readers. */
  lang?: string;
  children: React.ReactNode;
}) {
  return (
    <html
      lang={lang}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-white text-ink">{children}</body>
    </html>
  );
}
