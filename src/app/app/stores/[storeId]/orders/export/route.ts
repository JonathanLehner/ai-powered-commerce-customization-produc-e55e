import type { NextRequest } from "next/server";
import { auditCsvResponse as csvResponse } from "@/lib/audit-log";
import { listOrders } from "@/lib/data";
import { filterOrders, orderCsv, orderFileName, parseOrderFilters } from "@/lib/order-list";
import { assertStoreAccess } from "@/lib/session";

/**
 * The store's orders as a spreadsheet, filtered exactly as the Orders page was
 * when the download was started — the same query string produces the same rows,
 * which is what makes the download of a filtered view meaningful. The page
 * number is ignored: the download is the whole filtered queue, not one screen.
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
    return new Response(error instanceof Error ? error.message : "Access denied.", { status: 403 });
  }

  const filters = parseOrderFilters(Object.fromEntries(request.nextUrl.searchParams));
  const orders = await listOrders(storeId);
  const csv = orderCsv(filterOrders(orders, filters));
  return csvResponse(
    csv,
    orderFileName(`${store.name} orders`, filters, new Date().toISOString().slice(0, 10)),
  );
}
