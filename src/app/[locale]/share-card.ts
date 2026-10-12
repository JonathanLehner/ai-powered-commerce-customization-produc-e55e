import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getTranslations } from "next-intl/server";
import { LOCALES } from "@/i18n/locales";
import { asLocale } from "@/i18n/metadata";
import { siteShareImage } from "@/lib/share-image";

/** The share images are drawn at build time, one per language. */
export function shareImageParams() {
  return LOCALES.map((locale) => ({ locale }));
}

type PageNamespace = "howItWorks" | "pricing" | "contact" | "signup" | "terms" | "privacy";

/** A marketing page's share image: its title and description under the Parcelith brand. The home page passes no namespace. */
export async function marketingShareImage(params: Promise<{ locale: string }>, namespace?: PageNamespace) {
  const locale = asLocale((await params).locale);
  const logo = await readFile(join(process.cwd(), "public", "logo.png"));
  let title: string;
  let description: string;
  if (namespace) {
    const t = await getTranslations({ locale, namespace });
    [title, description] = [t("metaTitle"), t("metaDescription")];
  } else {
    const t = await getTranslations({ locale, namespace: "meta" });
    [title, description] = [t("title"), t("description")];
  }
  return siteShareImage({ logo: `data:image/png;base64,${logo.toString("base64")}`, title, description });
}
