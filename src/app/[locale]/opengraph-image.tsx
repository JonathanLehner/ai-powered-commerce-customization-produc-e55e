import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getTranslations } from "next-intl/server";
import { LOCALES } from "@/i18n/locales";
import { asLocale } from "@/i18n/metadata";
import { SHARE_SIZE, siteShareImage } from "@/lib/share-image";

/** The marketing site's share image, one per language, drawn at build time. */
export const dynamic = "force-static";
export const size = SHARE_SIZE;
export const contentType = "image/png";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const locale = asLocale((await params).locale);
  const [t, logo] = await Promise.all([
    getTranslations({ locale, namespace: "meta" }),
    readFile(join(process.cwd(), "public", "logo.png")),
  ]);
  return siteShareImage({
    logo: `data:image/png;base64,${logo.toString("base64")}`,
    title: t("title"),
    description: t("description"),
  });
}
