import { getTranslations } from "next-intl/server";
import { customerDataExport, getCustomer } from "@/lib/customer-data";
import { recordAudit } from "@/lib/data";
import { assertStoreAccess } from "@/lib/session";

/** Everything held about one customer in this store, as JSON. Each download is in the audit log. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ storeId: string; customerId: string }> },
) {
  const { storeId, customerId } = await params;

  let access;
  try {
    access = await assertStoreAccess(storeId, "store.orders");
  } catch (error) {
    return new Response(error instanceof Error ? error.message : (await getTranslations("audit"))("accessDenied"), { status: 403 });
  }
  const customer = await getCustomer(storeId, customerId);
  if (!customer) return new Response("Not found", { status: 404 });

  const data = await customerDataExport(storeId, customer);
  recordAudit({
    category: "customers",
    action: "customer.data_exported",
    summary: `Exported the data held on customer ${customer.id}`,
    storeId,
    agencyId: access.store.agencyId,
    actorId: access.user.id,
    actorName: access.user.name,
    entity: "customer",
    entityId: customer.id,
    meta: { orders: data.orders.length },
  });
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="customer-${customer.id}.json"`,
      "cache-control": "no-store",
    },
  });
}
