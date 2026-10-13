import { restHandler } from "@/lib/api/http";

export const GET = restHandler("getCurrencyRates");
export const PUT = restHandler("updateCurrencyRates");
