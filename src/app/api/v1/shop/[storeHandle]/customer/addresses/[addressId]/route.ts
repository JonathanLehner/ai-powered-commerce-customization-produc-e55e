import { shopHandler, shopPreflight } from "@/lib/api/http";

export const DELETE = shopHandler("deleteCustomerAddress");
export const OPTIONS = shopPreflight;
