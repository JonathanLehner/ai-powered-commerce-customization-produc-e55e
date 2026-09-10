"use client";

import { useState } from "react";
import { changeCampaignApprover, resendApprovalRequest } from "@/app/actions/gifting";
import { ActionForm, CopyField, Field } from "@/components/forms";
import { Badge } from "@/components/ui";

export interface ApprovalPanelProps {
  storeId: string;
  campaignId: string;
  campaignCode: string;
  approverName: string;
  approverEmail: string;
  /** The approver's own link, the one the decision is taken on. */
  approvalLink: string;
  /** “Waiting 4 days”, worked out on the server so both sides agree. */
  waitLabel: string;
  requestedAt: string;
  lastSentAt: string;
  reminders: number;
  stale: boolean;
  /** False for a role that may read the store but not run its gifting. */
  canManage: boolean;
}

export function ApprovalPanel({
  storeId,
  campaignId,
  campaignCode,
  approverName,
  approverEmail,
  approvalLink,
  waitLabel,
  requestedAt,
  lastSentAt,
  reminders,
  stale,
  canManage,
}: ApprovalPanelProps) {
  const [changing, setChanging] = useState(false);

  const mailto = approverEmail
    ? `mailto:${encodeURIComponent(approverEmail)}?subject=${encodeURIComponent(
        `Approval needed: gift campaign ${campaignCode}`,
      )}&body=${encodeURIComponent(
        `Hello${approverName ? ` ${approverName}` : ""},\n\nGift campaign ${campaignCode} is waiting for your approval. The list and its total are on your own link:\n\n${approvalLink}\n\nThank you.`,
      )}`
    : null;

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-base font-semibold text-ink">Approval</h2>
        <Badge tone={stale ? "rose" : "amber"}>{waitLabel}</Badge>
      </div>

      <p className="mt-2 text-sm text-inksoft">
        <span className="font-medium text-ink">{approverName || "No approver named"}</span>
        {approverEmail ? (
          <>
            {" · "}
            <a href={`mailto:${approverEmail}`} className="text-brand-700 hover:underline">
              {approverEmail}
            </a>
          </>
        ) : null}
      </p>
      <p className="mt-1 text-xs text-muted">
        Sent for approval on {requestedAt}. Last request {lastSentAt}
        {reminders > 0 ? ` · asked again ${reminders} ${reminders === 1 ? "time" : "times"}` : ""}.
      </p>
      {stale ? (
        <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          Nothing has been decided for {waitLabel.toLowerCase().replace("waiting ", "")}. Send the request again,
          or hand the campaign to somebody else at the company.
        </p>
      ) : null}

      <div className="mt-4">
        <p className="field-label">The approver&rsquo;s link</p>
        <CopyField value={approvalLink} />
      </div>

      {canManage ? (
        <>
          <ActionForm
            action={resendApprovalRequest}
            hidden={{ storeId, campaignId }}
            submitLabel="Resend approval request"
            pendingLabel="Recording…"
            submitClassName="btn-secondary btn-sm"
            className="mt-5 border-t border-line pt-5"
            footer={
              mailto ? (
                <a href={mailto} className="btn-ghost btn-sm">
                  Open in your mail app
                </a>
              ) : null
            }
          >
            <p className="text-sm text-muted">
              Parcelith does not mail the approver for you: the link above is theirs alone. Recording the request
              puts it in this campaign&rsquo;s history and the store&rsquo;s audit log, then send them the link.
            </p>
          </ActionForm>

          <div className="mt-5 border-t border-line pt-5">
            {changing ? (
              <ActionForm
                action={changeCampaignApprover}
                hidden={{ storeId, campaignId }}
                submitLabel="Change the approver"
                pendingLabel="Saving…"
                submitClassName="btn-primary btn-sm"
                footer={
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setChanging(false)}>
                    Cancel
                  </button>
                }
              >
                {(state) => (
                  <div className="space-y-4">
                    <p className="text-sm text-muted">
                      For an approver who has left or cannot be reached. The link stays the same — it belongs to
                      the campaign — so the new person can decide as soon as you send it to them.
                    </p>
                    <Field label="New approver" htmlFor="approverName">
                      <input
                        id="approverName"
                        name="approverName"
                        defaultValue=""
                        placeholder="Sam Okafor"
                        className={state.field === "approverName" ? "input input-error" : "input"}
                      />
                    </Field>
                    <Field label="Their email address" htmlFor="approverEmail">
                      <input
                        id="approverEmail"
                        name="approverEmail"
                        type="email"
                        placeholder="sam@northwind.example"
                        className={state.field === "approverEmail" ? "input input-error" : "input"}
                      />
                    </Field>
                    <Field
                      label="Why it moved"
                      htmlFor="reason"
                      hint="Optional. It is written into the campaign history and the audit log."
                    >
                      <input
                        id="reason"
                        name="reason"
                        placeholder="Dana has left the company"
                        className="input"
                      />
                    </Field>
                  </div>
                )}
              </ActionForm>
            ) : (
              <button type="button" className="btn-ghost btn-sm" onClick={() => setChanging(true)}>
                Change the approver
              </button>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
