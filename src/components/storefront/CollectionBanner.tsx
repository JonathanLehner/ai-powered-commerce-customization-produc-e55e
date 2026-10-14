import { srcSetFor } from "@/lib/image-variants";

/**
 * The full-width header a shop or collection page gets when its layout is set
 * to "banner": the photo edge to edge, darkened enough for white type.
 */
export function CollectionBanner({
  title,
  description,
  count,
  imageUrl,
}: {
  title: string;
  description: string;
  count: string;
  imageUrl: string;
}) {
  return (
    <header className="relative isolate flex min-h-[18rem] items-end overflow-hidden bg-neutral-900 sm:min-h-[22rem]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        srcSet={srcSetFor(imageUrl)}
        sizes="100vw"
        alt=""
        fetchPriority="high"
        className="absolute inset-0 -z-10 h-full w-full object-cover"
      />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black/75 via-black/35 to-black/10" />
      <div className="mx-auto w-full max-w-6xl px-4 py-10 text-white sm:px-6">
        <h1 className="font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">{title}</h1>
        {description ? <p className="mt-3 max-w-2xl text-base leading-relaxed whitespace-pre-line text-white/90">{description}</p> : null}
        <p className="mt-3 text-sm text-white/80">{count}</p>
      </div>
    </header>
  );
}
