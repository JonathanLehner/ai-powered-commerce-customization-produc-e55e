import { shopHandler, shopPreflight } from "@/lib/api/http";

export const POST = shopHandler("requestCustomerSignInLink");
export const OPTIONS = shopPreflight;
