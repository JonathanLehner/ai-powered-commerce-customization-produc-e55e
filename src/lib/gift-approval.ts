/**
 * A campaign that is sitting with its approver.
 *
 * A gift campaign can only be paid for once the company's approver has signed
 * the list off, and that approver is somebody at the client company rather than
 * a Parcelith user. When they are on leave, have left, or simply never opened
 * the link, the campaign stops dead and the store team is the only party that
 * can move it on. This module holds the rules for that: how long a campaign has
 * been waiting, when the request may be sent again, and when the approver may
 * be swapped for somebody else.
 *
 * Everything here is pure and free of database and request imports, so
 * `npm run gifting-check` exercises the same rules the server actions enforce.
 */

import type { CampaignStatus, GiftCampaign } from "./types";

/** The parts of a campaign the approval rules read. */
export interface ApprovalView {
  code: string;
  status: CampaignStatus;
  createdAt: string;
  approval: GiftCampaign["approval"];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How close together two resends may be.
 *
 * A double click, a retried submission or a tab left open on the panel must not
 * write the same chase twice into the history and the audit log.
 */
export const APPROVAL_RESEND_GAP_MS = 60 * 1000;

/**
 * When the campaign was first put in front of its approver.
 *
 * Campaigns written before the approval panel existed carry no `requestedAt`,
 * and for those the moment the buyer submitted the list is the same instant.
 */
export function approvalRequestedAt(campaign: ApprovalView): string {
  return campaign.approval.requestedAt || campaign.createdAt;
}

/** The last time the request went out, which for an unchased campaign is the first. */
export function approvalLastSentAt(campaign: ApprovalView): string {
  return campaign.approval.lastRequestedAt || approvalRequestedAt(campaign);
}

/** Whole days a campaign has been waiting on a decision. */
export function daysAwaitingApproval(campaign: ApprovalView, now: Date = new Date()): number {
  const since = new Date(approvalRequestedAt(campaign)).getTime();
  if (!Number.isFinite(since)) return 0;
  return Math.max(0, Math.floor((now.getTime() - since) / DAY_MS));
}

/** How the wait is written on screen: “Waiting 4 days”. */
export function approvalWaitLabel(days: number): string {
  if (days <= 0) return "Sent today";
  return days === 1 ? "Waiting 1 day" : `Waiting ${days} days`;
}

/**
 * A campaign nobody has looked at for a working week is worth flagging: it is
 * usually an approver who has left rather than one who is thinking about it.
 */
export const APPROVAL_STALE_DAYS = 7;

export function isApprovalStale(campaign: ApprovalView, now: Date = new Date()): boolean {
  return daysAwaitingApproval(campaign, now) >= APPROVAL_STALE_DAYS;
}

/** How many times the store team has chased the request. */
export function approvalRemindersSent(campaign: ApprovalView): number {
  const sent = campaign.approval.remindersSent;
  return typeof sent === "number" && sent > 0 ? Math.floor(sent) : 0;
}

/** The approver as one readable string: “Dana Whitfield (dana@…)”. */
export function approverLabel(campaign: ApprovalView): string {
  const { approverName, approverEmail } = campaign.approval;
  if (approverName && approverEmail) return `${approverName} (${approverEmail})`;
  return approverName || approverEmail || "the approver";
}

export type ApprovalCheck =
  | { ok: true }
  /** `duplicate` marks a repeat of a request that has only just gone out. */
  | { ok: false; duplicate: boolean; message: string };

function settled(campaign: ApprovalView): string {
  return `${campaign.code} is already ${campaign.status.replace(/_/g, " ")}.`;
}

/** Whether the approval request may be sent to the approver again right now. */
export function approvalResendCheck(campaign: ApprovalView, now: Date = new Date()): ApprovalCheck {
  if (!campaign.approval.required) {
    return { ok: false, duplicate: false, message: "This campaign has no approval step to chase." };
  }
  if (campaign.status !== "awaiting_approval") {
    return { ok: false, duplicate: false, message: settled(campaign) };
  }
  if (!campaign.approval.approverName && !campaign.approval.approverEmail) {
    return {
      ok: false,
      duplicate: false,
      message: "This campaign has no approver. Name one below and the request goes to them.",
    };
  }
  const last = campaign.approval.lastRequestedAt;
  if (last) {
    const since = now.getTime() - new Date(last).getTime();
    if (Number.isFinite(since) && since >= 0 && since < APPROVAL_RESEND_GAP_MS) {
      return {
        ok: false,
        duplicate: true,
        message: `The request has just gone to ${approverLabel(campaign)}. It was not sent twice.`,
      };
    }
  }
  return { ok: true };
}

export interface ApproverInput {
  name: string;
  email: string;
}

/** Whether this campaign's approver may be replaced by the person given. */
export function approverChangeCheck(campaign: ApprovalView, next: ApproverInput): ApprovalCheck {
  if (!campaign.approval.required) {
    return {
      ok: false,
      duplicate: false,
      message: "This campaign was placed without an approval step, so it has no approver to change.",
    };
  }
  if (campaign.status !== "awaiting_approval") {
    return { ok: false, duplicate: false, message: settled(campaign) };
  }
  const name = next.name.trim();
  const email = next.email.trim().toLowerCase();
  if (name.length < 2) {
    return { ok: false, duplicate: false, message: "Enter the new approver's name." };
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, duplicate: false, message: "Enter a valid email address for the new approver." };
  }
  if (
    email === campaign.approval.approverEmail.trim().toLowerCase() &&
    name === campaign.approval.approverName.trim()
  ) {
    return {
      ok: false,
      duplicate: true,
      message: `${name} is already the approver on ${campaign.code}.`,
    };
  }
  return { ok: true };
}
