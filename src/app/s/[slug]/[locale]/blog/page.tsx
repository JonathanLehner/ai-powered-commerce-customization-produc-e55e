import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFoundRobots, UnknownStoreView } from "@/components/NotFoundViews";
import { shopperIntl, shopperLocale, shopperTranslator } from "@/i18n/storefront";
import { storeLanguages } from "@/i18n/storefront-routing";
import { BLOG_PATH, contentPath, entrySummary, localizeEntry } from "@/lib/content";
import { listPublishedContent } from "@/lib/content-data";
import { shopperPageMetadata } from "@/lib/storefront-meta";
import { storefrontBySlug } from "@/lib/storefront-data";

type Params = Promise<{ slug: string; locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug, locale } = await params;
  const store = (await storefrontBySlug(slug))?.store ?? null;
  if (!store) return notFoundRobots;
  const active = shopperLocale(store, locale);
  const t = await shopperTranslator(store, active);
  return shopperPageMetadata(store, active, BLOG_PATH, { title: t("blog.title") });
}

/** The store's blog: published posts, newest first. */
export default async function BlogPage({ params }: { params: Params }) {
  const { slug, locale: requested } = await params;
  const store = (await storefrontBySlug(slug))?.store ?? null;
  if (!store) return <UnknownStoreView slug={slug} />;
  const { locale, t, format, base } = await shopperIntl(store, requested, `/s/${store.slug}`);
  const { defaultLocale } = storeLanguages(store);
  const posts = (await listPublishedContent(store.id, "post")).map((post) => localizeEntry(post, locale, defaultLocale));

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6">
      <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">{t("blog.title")}</h1>
      {posts.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">{t("blog.empty")}</p>
      ) : (
        <ul className="mt-8 grid gap-8 sm:grid-cols-2">
          {posts.map((post, index) => (
            <li key={post.id}>
              <Link href={`${base}${contentPath("post", post.handle)}`} className="group block">
                <div className="overflow-hidden rounded-xl border border-border bg-muted" style={{ aspectRatio: "16 / 9" }}>
                  {post.coverImageUrl ? (
                    <Image
                      src={post.coverImageUrl}
                      alt=""
                      width={960}
                      height={540}
                      sizes="(min-width: 640px) 480px, 100vw"
                      priority={index === 0}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                  ) : null}
                </div>
                <h2 className="mt-4 font-heading text-lg font-semibold text-foreground group-hover:underline">{post.title}</h2>
                {post.publishedAt ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {format.dateTime(new Date(post.publishedAt), { dateStyle: "long" })}
                  </p>
                ) : null}
                <p className="mt-2 text-sm text-inksoft">{entrySummary(post)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
