import { NextResponse, type NextRequest } from "next/server";
import { getGiftCatalogueBySlug } from "@/lib/data";
import { GIFT_LINK_HOLDER, giftAccessCookie, verifyCatalogueToken } from "@/lib/gift-access";

/**
 * The private link.
 *
 * Landing here with a valid `?k=` exchanges the token for the access cookie and
 * sends the buyer on to the catalogue, so the rest of the portal works without
 * the secret trailing every URL. A wrong or rotated token just lands on the
 * gate, which explains what to do next.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const catalogue = await getGiftCatalogueBySlug(slug);
  const target = new URL(`/g/${slug}`, request.nextUrl.origin);

  if (!catalogue) return NextResponse.redirect(new URL("/", request.nextUrl.origin));

  const response = NextResponse.redirect(target);
  const token = request.nextUrl.searchParams.get("k") ?? undefined;
  // An invite-gated catalogue is never opened by a link alone — it asks for the
  // work email on the page this redirects to.
  if (
    catalogue.status === "active" &&
    catalogue.access === "link" &&
    (await verifyCatalogueToken(catalogue, token))
  ) {
    const cookie = await giftAccessCookie(catalogue, GIFT_LINK_HOLDER);
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }
  return response;
}
