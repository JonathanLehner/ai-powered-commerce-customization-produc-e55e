import { shopHandler, shopPreflight } from "@/lib/api/http";

export const POST = shopHandler("lookupOrder");
export const OPTIONS = shopPreflight;
