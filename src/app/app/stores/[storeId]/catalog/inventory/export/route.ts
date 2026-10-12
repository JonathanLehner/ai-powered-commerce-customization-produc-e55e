import { getTranslations } from "next-intl/server";
import type { NextRequest } from "next/server";
import { auditCsvResponse as csvResponse, csvDocument } from "@/lib/audit-log";
import { filterInventory, inventoryCsvRows, inventorySettings, parseInventoryFilter } from "@/lib/inventory-rules";
import { storeInventory } from "@/lib/operations/inventory";
import { assertStoreAccess } from "@/lib/session";
import { slugify } from "@/lib/util";

/**
 * The store's stock as a spreadsheet, filtered as the Inventory page was. The
 * columns are the ones the import reads back, so a file can be edited and
 * uploaded again.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  let store;
  try {
    ({ store } = await assertStoreAccess(storeId, "store.view"));
  } catch (error) {
    return new Response(error instanceof Error ? error.message : (await getTranslations("audit"))("accessDenied"), { status: 403 });
  }
  const search = request.nextUrl.searchParams;
  const { rows } = await storeInventory(storeId, inventorySettings(store));
  const filtered = filterInventory(rows, search.get("q") ?? "", parseInventoryFilter(search.get("filter")));
  const today = new Date().toISOString().slice(0, 10);
  return csvResponse(csvDocument(inventoryCsvRows(filtered)), `${slugify(store.name) || "store"}-inventory-${today}.csv`);
}
