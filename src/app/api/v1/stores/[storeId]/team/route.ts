import { restHandler } from "@/lib/api/http";

export const GET = restHandler("listTeamMembers");
export const POST = restHandler("inviteTeamMember");
