import { restHandler } from "@/lib/api/http";

export const GET = restHandler("listRedirects");
export const POST = restHandler("createRedirect");
