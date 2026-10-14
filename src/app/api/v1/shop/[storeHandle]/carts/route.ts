import { shopHandler, shopPreflight } from "@/lib/api/http";

export const POST = shopHandler("createCart");
export const OPTIONS = shopPreflight;
