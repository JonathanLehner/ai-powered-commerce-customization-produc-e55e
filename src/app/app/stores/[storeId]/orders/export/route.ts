import { getLocale, getTranslations } from "next-intl/server";
import type { NextRequest } from "next/server";
import { auditCsvResponse as csvResponse } from "@/lib/audit-log";
import { parseOrderIds, pickOrders } from "@/lib/bulk-orders";
import { listOrders } from "@/lib/data";
import { filterOrders, orderCsv, orderFileName, parseOrderFilters } from "@/lib/order-list";
import { countryName } from "@/i18n/display";
import { assertStoreAccess } from "@/lib/session";

/**
 * The store's orders as a spreadsheet, filtered exactly as the Orders page was
 * when the download was started — the same query string produces the same rows,
 * which is what makes the download of a filtered view meaningful. The page
 * number is ignored: the download is the whole filtered queue, not one screen.
 * With `ids`, the orders ticked on the page are downloaded instead.
 *
 * Shopper names, addresses and order values are in it, so it is the order
 * managers' capability that opens it rather than plain store access — platform
 * oversight reads the queue without those columns and does not get the file.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;

  let store;
  try {
    ({ store } = await assertStoreAccess(storeId, "store.orders"));
  } catch (error) {
    return new Response(error instanceof Error ? error.message : (await getTranslations("audit"))("accessDenied"), { status: 403 });
  }

  const filters = parseOrderFilters(Object.fromEntries(request.nextUrl.searchParams));
  const ids = parseOrderIds(request.nextUrl.searchParams.get("ids") ?? "");
  const all = await listOrders(storeId);
  const orders = ids.length > 0 ? pickOrders(all, ids) : filterOrders(all, filters);
  const [t, labels, locale] = await Promise.all([
    getTranslations("orders"),
    getTranslations("labels"),
    getLocale(),
  ]);
  const columns = [
    "order", "placed", "status", "customer", "email", "country", "items", "currency",
    "subtotal", "tax", "shipping", "total", "refunded", "carrier", "tracking",
  ] as const;
  const csv = orderCsv(orders, {
    columns: columns.map((key) => t(`columns.${key}`)),
    status: (status) => labels(`orderStatus.${status}`),
    country: (code) => countryName(locale, code),
  });
  return csvResponse(
    csv,
    orderFileName(
      ids.length > 0 ? t("selectedFileName", { store: store.name }) : t("fileName", { store: store.name }),
      filters,
      new Date().toISOString().slice(0, 10),
    ),
  );
}
