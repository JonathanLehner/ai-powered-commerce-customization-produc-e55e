import { notFound } from "next/navigation";

/** Any address inside a gift portal that matches no page is a 404 in the portal. */
export default function GiftPortalCatchAll(): never {
  notFound();
}
