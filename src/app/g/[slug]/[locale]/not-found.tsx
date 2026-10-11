import { GiftPortalNotFound } from "@/components/GiftPortalFallback";

/**
 * The gift portal's not-found boundary. Portal routes render their own
 * not-found body so it reaches the browser as HTML; a boundary is handed no
 * params, so this backstop reads the catalogue and its language from the
 * layout's context.
 */
export default function GiftPortalNotFoundPage() {
  return <GiftPortalNotFound />;
}
