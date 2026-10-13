import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { publicStoreRoot, shopperLocale } from "@/i18n/storefront";
import { localeBase, storeLanguages } from "@/i18n/storefront-routing";
import { restoreCart, verifyRecoveryToken } from "@/lib/checkout-recovery";
import { getOrder, getStoreBySlug } from "@/lib/data";
import { SHOPPER_COOKIE } from "@/lib/session";
import { newId } from "@/lib/util";

/**
 * The link in an abandoned checkout email: puts that checkout's lines back in
 * the shopper's basket and opens it. A link that does not verify, or a basket
 * already paid for, just opens the basket.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string; locale: string }> }) {
  const { slug, locale } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) redirect(`/s/${slug}`);
  const base = localeBase(await publicStoreRoot(store.slug), shopperLocale(store, locale), storeLanguages(store).defaultLocale);

  const orderId = request.nextUrl.searchParams.get("o") ?? "";
  const order = orderId ? await getOrder(orderId) : null;
  if (
    store.status === "active" &&
    order &&
    order.storeId === store.id &&
    order.abandoned &&
    !order.abandoned.recoveredAt &&
    (await verifyRecoveryToken(store.id, order.id, request.nextUrl.searchParams.get("t")))
  ) {
    const jar = await cookies();
    let session = jar.get(SHOPPER_COOKIE)?.value;
    if (!session) {
      session = newId("shp");
      jar.set(SHOPPER_COOKIE, session, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
        secure: process.env.NODE_ENV === "production",
      });
    }
    await restoreCart(order, session);
    revalidatePath(`/s/${store.slug}`, "layout");
    if (store.currencies.includes(order.currency)) {
      jar.set("cc_currency", order.currency, {
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
        secure: process.env.NODE_ENV === "production",
      });
    }
  }
  redirect(`${base}/cart`);
}
