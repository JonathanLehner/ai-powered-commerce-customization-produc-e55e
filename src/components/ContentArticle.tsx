import Image from "next/image";
import { sanitizeRichText } from "@/lib/rich-text";

/**
 * A page or blog post as shoppers read it. The body was sanitised when it was
 * saved and is sanitised again here, so a stored record written under an older
 * rule is held to the current one.
 */
export function ContentArticle({
  title,
  body,
  coverImageUrl,
  meta,
}: {
  title: string;
  body: string;
  coverImageUrl: string | null;
  /** A line under the title, such as the date of a post. */
  meta?: React.ReactNode;
}) {
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{title}</h1>
      {meta ? <p className="mt-3 text-sm text-muted-foreground">{meta}</p> : null}
      {coverImageUrl ? (
        <div className="mt-8 overflow-hidden rounded-xl border border-border bg-muted" style={{ aspectRatio: "16 / 9" }}>
          <Image
            src={coverImageUrl}
            alt=""
            width={1536}
            height={864}
            sizes="(min-width: 768px) 720px, 100vw"
            priority
            className="h-full w-full object-cover"
          />
        </div>
      ) : null}
      <div className="rich-text mt-8 text-base text-inksoft" dangerouslySetInnerHTML={{ __html: sanitizeRichText(body) }} />
    </article>
  );
}
