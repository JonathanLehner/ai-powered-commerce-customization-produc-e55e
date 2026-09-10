import type { NextRequest } from "next/server";
import {
  auditCsv,
  auditCsvResponse,
  auditFileName,
  auditWindow,
  matchesAuditFilters,
  parseAuditFilters,
  platformAuditEntries,
  AUDIT_EXPORT_CAP,
} from "@/lib/audit-log";
import { getAgency, listSuppliers, loadAuditWindow } from "@/lib/data";
import { auditExportMessage, planFor } from "@/lib/plans";
import { assertStoreAccess } from "@/lib/session";

/**
 * The store's audit history as a spreadsheet, filtered exactly as the Activity
 * page was when the download was started — the same query string produces the
 * same rows, which is what makes the download of a filtered view meaningful.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;

  let store;
  let viaPlatform = false;
  try {
    ({ store, viaPlatform } = await assertStoreAccess(storeId, "store.view"));
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Access denied.", { status: 403 });
  }

  const agency = await getAgency(store.agencyId);
  const plan = planFor(agency?.plan);
  if (!plan.auditExport) {
    return new Response(auditExportMessage(plan, agency?.name ?? "This agency"), { status: 403 });
  }

  const filters = parseAuditFilters(Object.fromEntries(request.nextUrl.searchParams));
  const scope: Record<string, unknown> = { storeId };
  if (filters.category) scope.category = filters.category;
  const now = new Date();
  const { entries } = await loadAuditWindow(
    scope,
    auditWindow(filters, store.createdAt, now.toISOString()),
    AUDIT_EXPORT_CAP,
  );

  // The download carries exactly what the page shows, so platform access gets
  // the same history without the shopper names and order values in it.
  const readable = viaPlatform ? platformAuditEntries(entries) : entries;
  const suppliers = await listSuppliers();
  const csv = auditCsv(readable.filter((entry) => matchesAuditFilters(entry, filters)), {
    detail: {
      currency: store.defaultCurrency,
      supplierName: (id) => suppliers.find((supplier) => supplier.id === id)?.name,
    },
  });
  return auditCsvResponse(csv, auditFileName(`${store.name} activity`, filters, now.toISOString().slice(0, 10)));
}
