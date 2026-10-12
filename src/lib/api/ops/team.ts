import "server-only";
import { z } from "zod";
import { listMemberships, listUsers } from "../../data";
import type { OperationContext } from "../../operations/context";
import { changeMemberRole, findMembership, inviteTeamMember, removeMember, resendInvite } from "../../operations/team";
import { STORE_ROLES } from "../../people";
import { define, id, notFound, type ApiOperation } from "../define";
import { presentMembership } from "../present-team";

/**
 * The store's team, as its Team page shows and changes it: the people invited
 * to the store and their roles. Invitation acceptance links are never returned;
 * they only go to the invited person by email.
 */

async function membership(ctx: OperationContext, membershipId: string) {
  return (await findMembership(ctx.store.id, membershipId)) ?? notFound("Team member");
}

const role = z
  .enum(STORE_ROLES as [string, ...string[]])
  .describe("store_admin (everything, including settings and team), catalog_manager, order_manager or viewer.");

export const teamOperations: ApiOperation[] = [
  define({
    id: "listTeamMembers",
    method: "GET",
    path: "/team",
    scope: "team:read",
    tag: "Team",
    summary: "List the store team",
    description:
      "Everyone invited to the store, with their role and whether they have accepted (`active`) or not yet (`invited`), oldest invitation first. `agencyAdmins` are the agency's administrators, who reach every store through the agency and are not members.",
    input: z.object({}),
    run: async (ctx) => {
      const [memberships, users] = await Promise.all([listMemberships(ctx.store.id), listUsers()]);
      return {
        data: memberships.map(presentMembership),
        agencyAdmins: users
          .filter((user) => user.agencyId === ctx.store.agencyId && user.platformRole === "agency_admin")
          .map((user) => ({ name: user.name, email: user.email, title: user.title })),
      };
    },
  }),
  define({
    id: "inviteTeamMember",
    method: "POST",
    path: "/team",
    scope: "team:write",
    tag: "Team",
    summary: "Invite someone to the store team",
    description:
      "Gives a person a role in the store. Someone who already has an account is active at once; anyone else is emailed a link to accept the invitation. An email address already on the team is refused.",
    status: 201,
    actions: ["team#inviteTeamMember"],
    input: z.object({
      email: z.string().describe("The person's email address."),
      name: z.string().describe("Their name, at least 2 characters. An existing account keeps its own name."),
      role,
      language: z
        .string()
        .optional()
        .describe("The language code the invitation email is written in, such as de, when the person has no account yet."),
    }),
    run: async (ctx, input) => presentMembership((await inviteTeamMember(ctx, input)).membership),
  }),
  define({
    id: "updateTeamMemberRole",
    method: "PATCH",
    path: "/team/{membershipId}",
    scope: "team:write",
    tag: "Team",
    summary: "Change a team member's role",
    description: "Moves a member, or a pending invitation, to another role. The same role again changes nothing.",
    actions: ["team#changeMemberRole"],
    input: z.object({ membershipId: id("membership"), role }),
    run: async (ctx, input) =>
      presentMembership(await changeMemberRole(ctx, await membership(ctx, input.membershipId), input.role)),
  }),
  define({
    id: "removeTeamMember",
    method: "DELETE",
    path: "/team/{membershipId}",
    scope: "team:write",
    tag: "Team",
    summary: "Remove someone from the store team",
    description: "Takes the member's access to the store away, or withdraws a pending invitation so its link stops working.",
    destructive: true,
    actions: ["team#removeMember"],
    input: z.object({ membershipId: id("membership") }),
    run: async (ctx, input) => {
      const record = await membership(ctx, input.membershipId);
      await removeMember(ctx, record);
      return { id: record.id, removed: true };
    },
  }),
  define({
    id: "resendTeamInvitation",
    method: "POST",
    path: "/team/{membershipId}/resend-invitation",
    scope: "team:write",
    tag: "Team",
    summary: "Send a pending invitation again",
    description:
      "Issues a new acceptance link for an invitation not yet accepted and emails it to the person. The previous link stops working. Refused once the invitation has been accepted.",
    actions: ["team#resendInvite"],
    input: z.object({ membershipId: id("membership") }),
    run: async (ctx, input) => presentMembership(await resendInvite(ctx, await membership(ctx, input.membershipId))),
  }),
];
