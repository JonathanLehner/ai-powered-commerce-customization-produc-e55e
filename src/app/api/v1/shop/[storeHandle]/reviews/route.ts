import { shopHandler, shopPreflight } from "@/lib/api/http";

export const POST = shopHandler("submitReview");
export const OPTIONS = shopPreflight;
