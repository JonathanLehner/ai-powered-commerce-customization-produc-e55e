import { restHandler } from "@/lib/api/http";

export const GET = restHandler("listCustomers");
export const POST = restHandler("createCustomer");
