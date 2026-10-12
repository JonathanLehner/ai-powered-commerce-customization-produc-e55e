import { restHandler } from "@/lib/api/http";

export const PATCH = restHandler("updateTeamMemberRole");
export const DELETE = restHandler("removeTeamMember");
