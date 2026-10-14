import { restHandler } from "@/lib/api/http";

export const GET = restHandler("listPlatformKeys");
export const POST = restHandler("createPlatformKey");
