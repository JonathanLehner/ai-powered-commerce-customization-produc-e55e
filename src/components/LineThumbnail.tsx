import { thumbnailSource } from "@/lib/line-preview";
import { DEFAULT_PLACEMENT, type ArtworkPlacement, type PreviewOverlay } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface LineThumbnailProps {
  previewUrl: string | null;
  /** Present when `previewUrl` is the plain photo and the personalisation is drawn here instead. */
  previewOverlay?: PreviewOverlay | null;
  text?: string | null;
  artworkUrl?: string | null;
  artworkPlacement?: ArtworkPlacement | null;
  alt: string;
  /** Square size, e.g. `size-16`. */
  className?: string;
}

/**
 * The shopper's personalised product beside a basket, checkout or order line.
 * Usually the stored composite; when that could not be drawn, the photo in the
 * chosen colour with the text and artwork laid over the print area the way the
 * composite places them.
 */
export function LineThumbnail({
  previewUrl,
  previewOverlay,
  text,
  artworkUrl,
  artworkPlacement,
  alt,
  className,
}: LineThumbnailProps) {
  const rect = previewOverlay?.rect;
  const placement = artworkPlacement ?? DEFAULT_PLACEMENT;
  return (
    <div
      className={cn(
        "@container relative aspect-square shrink-0 overflow-hidden rounded-md border border-border bg-muted",
        className,
      )}
    >
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbnailSource(previewUrl)}
          alt={alt}
          width={96}
          height={96}
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      ) : null}
      {rect && previewOverlay ? (
        <div
          aria-hidden
          className="absolute"
          style={{
            left: `${rect.x * 100}%`,
            top: `${rect.y * 100}%`,
            width: `${rect.w * 100}%`,
            height: `${rect.h * 100}%`,
          }}
        >
          {artworkUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={artworkUrl}
              alt=""
              loading="lazy"
              className="absolute max-w-none"
              style={{
                left: `${placement.x * 100}%`,
                top: `${placement.y * 100}%`,
                width: `${placement.scale * 100}%`,
                transform: `translate(-50%, -50%) rotate(${placement.rotation}deg)`,
              }}
            />
          ) : null}
          {text ? (
            <span
              className="absolute top-[86%] left-1/2 -translate-1/2 font-bold leading-none whitespace-nowrap"
              style={{ color: previewOverlay.textColour, fontSize: `${rect.w * 17.6}cqw` }}
            >
              {text}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
