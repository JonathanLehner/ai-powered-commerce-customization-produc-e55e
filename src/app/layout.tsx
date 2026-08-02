import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-white text-ink">{children}</body>
    </html>
  );
}
