import { shopHandler, shopPreflight } from "@/lib/api/http";

export const PUT = shopHandler("setCustomerMarketingConsent");
export const OPTIONS = shopPreflight;
