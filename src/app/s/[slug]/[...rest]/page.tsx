import { notFound } from "next/navigation";

/**
 * Any address under a storefront that matches no page — an old campaign link, a
 * typo — is a 404 in that store rather than a bare framework page. The real
 * routes are more specific, so they always win over this catch-all.
 */
export default function StorefrontCatchAll(): never {
  notFound();
}
