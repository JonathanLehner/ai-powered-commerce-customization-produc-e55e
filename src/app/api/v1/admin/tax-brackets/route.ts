import { restHandler } from "@/lib/api/http";

export const GET = restHandler("listPlatformTaxBrackets");
export const POST = restHandler("createTaxBracket");
