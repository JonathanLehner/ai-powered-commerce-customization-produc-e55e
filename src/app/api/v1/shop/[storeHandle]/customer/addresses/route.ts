import { shopHandler, shopPreflight } from "@/lib/api/http";

export const GET = shopHandler("listCustomerAddresses");
export const POST = shopHandler("saveCustomerAddress");
export const OPTIONS = shopPreflight;
