import { getTranslations } from "next-intl/server";
import type { NextRequest } from "next/server";
import { auditCsvResponse as csvResponse } from "@/lib/audit-log";
import { parseCustomerFilters } from "@/lib/customers";
import { customersSpreadsheet } from "@/lib/operations/customers";
import { assertStoreAccess, operationContext } from "@/lib/session";

/**
 * The store's customers as a spreadsheet, filtered and sorted exactly as the
 * Customers page was. The page number is ignored: the download is the whole
 * filtered list.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;

  let access;
  try {
    access = await assertStoreAccess(storeId, "store.orders");
  } catch (error) {
    return new Response(error instanceof Error ? error.message : (await getTranslations("audit"))("accessDenied"), { status: 403 });
  }

  const filters = parseCustomerFilters(Object.fromEntries(request.nextUrl.searchParams));
  const { csv, fileName } = await customersSpreadsheet(await operationContext(access), filters);
  return csvResponse(csv, fileName);
}
