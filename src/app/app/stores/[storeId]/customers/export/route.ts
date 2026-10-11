import { getLocale, getTranslations } from "next-intl/server";
import type { NextRequest } from "next/server";
import { auditCsvResponse as csvResponse } from "@/lib/audit-log";
import { listCustomers } from "@/lib/customer-data";
import { customerCsv, customerFileName, filterCustomers, parseCustomerFilters } from "@/lib/customers";
import { countryName, languageName } from "@/i18n/display";
import { assertStoreAccess } from "@/lib/session";

/**
 * The store's customers as a spreadsheet, filtered and sorted exactly as the
 * Customers page was. The page number is ignored: the download is the whole
 * filtered list.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;

  let store;
  try {
    ({ store } = await assertStoreAccess(storeId, "store.orders"));
  } catch (error) {
    return new Response(error instanceof Error ? error.message : (await getTranslations("audit"))("accessDenied"), { status: 403 });
  }

  const now = new Date();
  const filters = parseCustomerFilters(Object.fromEntries(request.nextUrl.searchParams));
  const [customers, t, locale] = await Promise.all([listCustomers(storeId), getTranslations("customers"), getLocale()]);
  const columns = [
    "name", "email", "country", "firstOrder", "lastOrder", "orders", "currency",
    "spend", "refunded", "language", "preferredCurrency",
  ] as const;
  const csv = customerCsv(filterCustomers(customers, filters, now), {
    columns: columns.map((key) => t(`columns.${key}`)),
    country: (code) => countryName(locale, code),
    language: (code) => languageName(locale, code),
    deleted: t("deleted"),
  });
  return csvResponse(
    csv,
    customerFileName(t("fileName", { store: store.name }), filters, now.toISOString().slice(0, 10)),
  );
}
