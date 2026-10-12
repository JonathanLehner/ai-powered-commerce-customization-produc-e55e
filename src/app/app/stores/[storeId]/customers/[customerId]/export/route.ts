import { getTranslations } from "next-intl/server";
import { getCustomer } from "@/lib/customer-data";
import { exportCustomer } from "@/lib/operations/customers";
import { assertStoreAccess, operationContext } from "@/lib/session";

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

  const data = await exportCustomer(await operationContext(access), customer);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="customer-${customer.id}.json"`,
      "cache-control": "no-store",
    },
  });
}
