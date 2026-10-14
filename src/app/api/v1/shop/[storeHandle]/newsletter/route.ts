import { shopHandler, shopPreflight } from "@/lib/api/http";

export const POST = shopHandler("subscribeToNewsletter");
export const OPTIONS = shopPreflight;
