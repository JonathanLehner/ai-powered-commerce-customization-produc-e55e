import type { Metadata } from "next";
import Link from "next/link";
import { ContentArticle } from "@/components/ContentArticle";
import { JsonLd } from "@/components/JsonLd";
import { notFoundRobots, UnknownStoreView } from "@/components/NotFoundViews";
import { StorefrontNotFoundView } from "@/components/ShopperNotFoundViews";
import { shopperIntl, shopperLocale } from "@/i18n/storefront";
import { storeLanguages } from "@/i18n/storefront-routing";
import { BLOG_PATH, contentPath, entrySummary, localizeEntry } from "@/lib/content";
import { getPublishedEntry } from "@/lib/content-data";
import { contentMetadata } from "@/lib/content-meta";
import { breadcrumbJsonLd, storeUrl } from "@/lib/seo";
import { storefrontBySlug } from "@/lib/storefront-data";

type Params = Promise<{ slug: string; locale: string; handle: string }>;

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug, locale, handle } = await params;
  const store = (await storefrontBySlug(slug))?.store ?? null;
  if (!store) return notFoundRobots;
  const entry = await getPublishedEntry(store.id, "post", decode(handle));
  if (!entry) return { title: "Not found", ...notFoundRobots };
  const active = shopperLocale(store, locale);
  return contentMetadata(store, active, localizeEntry(entry, active, storeLanguages(store).defaultLocale));
}

/** One blog post, in the shopper's language. */
export default async function BlogPostPage({ params }: { params: Params }) {
  const { slug, locale: requested, handle } = await params;
  const store = (await storefrontBySlug(slug))?.store ?? null;
  if (!store) return <UnknownStoreView slug={slug} />;
  const stored = await getPublishedEntry(store.id, "post", decode(handle));
  if (!stored) return <StorefrontNotFoundView store={store} locale={requested} />;
  const { locale, t, format, base } = await shopperIntl(store, requested, `/s/${store.slug}`);
  const post = localizeEntry(stored, locale, storeLanguages(store).defaultLocale);
  const url = storeUrl(store, locale, contentPath("post", post.handle));
  const structured = [
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: post.title,
      description: entrySummary(post, 300),
      url,
      inLanguage: locale,
      ...(post.publishedAt ? { datePublished: post.publishedAt } : {}),
      dateModified: post.updatedAt,
      ...(post.coverImageUrl ? { image: [post.coverImageUrl] } : {}),
      author: { "@type": "Organization", name: store.name },
      publisher: { "@type": "Organization", name: store.name, ...(store.logoUrl ? { logo: store.logoUrl } : {}) },
    },
    breadcrumbJsonLd([
      { name: store.name, url: storeUrl(store, locale) },
      { name: t("blog.title"), url: storeUrl(store, locale, BLOG_PATH) },
      { name: post.title, url },
    ]),
  ];

  return (
    <>
      <JsonLd data={structured} />
      <div className="mx-auto w-full max-w-3xl px-4 pt-8 sm:px-6">
        <Link href={`${base}${BLOG_PATH}`} className="text-sm text-muted-foreground hover:text-foreground hover:underline">
          {t("blog.back")}
        </Link>
      </div>
      <ContentArticle
        title={post.title}
        body={post.body}
        coverImageUrl={post.coverImageUrl}
        meta={post.publishedAt ? format.dateTime(new Date(post.publishedAt), { dateStyle: "long" }) : undefined}
      />
    </>
  );
}
