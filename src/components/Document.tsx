import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "@/app/globals.css";
import { BaseIntlProvider } from "@/components/BaseIntlProvider";
import { SITE_ORIGIN } from "@/lib/seo";
import en from "../../messages/en.json";

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
  // Absolute addresses for the canonical and hreflang links.
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    default: "Parcelith: branded merchandise stores for agencies",
    template: "%s · Parcelith",
  },
  description:
    "Source, customise and sell print-on-demand products for every client from one agency workspace.",
  openGraph: {
    title: "Parcelith: branded merchandise stores for agencies",
    description:
      "Source, customise and sell print-on-demand products for every client from one agency workspace.",
    type: "website",
  },
};

export function Document({
  lang = "en",
  style,
  className = "",
  attributes,
  children,
}: {
  /** BCP-47 tag announced to browsers and screen readers. */
  lang?: string;
  /**
   * CSS variables for the whole document. A client storefront passes its own
   * theme here (see `storeThemeStyle`) so every shadcn component below — and
   * everything a Sheet or Select portals into `<body>` — reads the client's
   * colours, type and hairlines without a per-component override.
   */
  style?: React.CSSProperties;
  /** Extra classes for `<html>`: a storefront adds its web fonts' variables. */
  className?: string;
  /** `data-*` attributes for `<html>`, such as a storefront's button style. */
  attributes?: Record<`data-${string}`, string>;
  children: React.ReactNode;
}) {
  return (
    <html
      lang={lang}
      style={style}
      {...attributes}
      className={`${geistSans.variable} ${geistMono.variable} ${className} h-full antialiased`}
    >
      {/* A themed document paints its own background, so a dark storefront has no white overscroll. */}
      <body className={`min-h-full flex flex-col text-ink ${style ? "bg-background" : "bg-white"}`}>
        <BaseIntlProvider messages={{ common: en.common }}>{children}</BaseIntlProvider>
      </body>
    </html>
  );
}
