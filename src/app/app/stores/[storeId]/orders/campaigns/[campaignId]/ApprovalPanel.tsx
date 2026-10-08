"use client";

import { useState } from "react";
import { changeCampaignApprover, resendApprovalRequest } from "@/app/actions/gifting";
import { ActionForm, CopyField, Field } from "@/components/forms";
import { Badge } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

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
    <Card>
      <CardHeader>
        <CardTitle asChild>
          <h2>Approval</h2>
        </CardTitle>
        <CardAction>
          <Badge tone={stale ? "rose" : "amber"}>{waitLabel}</Badge>
        </CardAction>
      </CardHeader>

      <CardContent>
      <p className="text-sm text-inksoft">
        <span className="font-medium text-foreground">{approverName || "No approver named"}</span>
        {approverEmail ? (
          <>
            {" · "}
            <a href={`mailto:${approverEmail}`} className="text-primary hover:underline">
              {approverEmail}
            </a>
          </>
        ) : null}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
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
        <p className="text-sm leading-none font-medium text-foreground select-none">
          The approver&rsquo;s link
        </p>
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
            className="mt-5 border-t border-border pt-5"
            footer={
              mailto ? (
                <Button asChild variant="ghost" size="sm">
                  <a href={mailto}>Open in your mail app</a>
                </Button>
              ) : null
            }
          >
            <p className="text-sm text-muted-foreground">
              The request is emailed to the approver again, and recorded in this campaign&rsquo;s history and the
              store&rsquo;s audit log. The link above is theirs alone if you would rather send it yourself.
            </p>
          </ActionForm>

          <div className="mt-5 border-t border-border pt-5">
            {changing ? (
              <ActionForm
                action={changeCampaignApprover}
                hidden={{ storeId, campaignId }}
                submitLabel="Change the approver"
                pendingLabel="Saving…"
                submitClassName="btn-primary btn-sm"
                footer={
                  <Button type="button" variant="ghost" size="sm" onClick={() => setChanging(false)}>
                    Cancel
                  </Button>
                }
              >
                {(state) => (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      For an approver who has left or cannot be reached. The link stays the same — it belongs to
                      the campaign — and the new person is emailed the request as soon as you save this.
                    </p>
                    <Field label="New approver" htmlFor="approverName">
                      <Input
                        id="approverName"
                        name="approverName"
                        defaultValue=""
                        placeholder="Sam Okafor"
                        className="mt-1.5"
                        aria-invalid={state.field === "approverName" ? true : undefined}
                      />
                    </Field>
                    <Field label="Their email address" htmlFor="approverEmail">
                      <Input
                        id="approverEmail"
                        name="approverEmail"
                        type="email"
                        placeholder="sam@northwind.example"
                        className="mt-1.5"
                        aria-invalid={state.field === "approverEmail" ? true : undefined}
                      />
                    </Field>
                    <Field
                      label="Why it moved"
                      htmlFor="reason"
                      hint="Optional. It is written into the campaign history and the audit log."
                    >
                      <Input
                        id="reason"
                        name="reason"
                        placeholder="Dana has left the company"
                        className="mt-1.5"
                      />
                    </Field>
                  </div>
                )}
              </ActionForm>
            ) : (
              <Button type="button" variant="ghost" size="sm" onClick={() => setChanging(true)}>
                Change the approver
              </Button>
            )}
          </div>
        </>
      ) : null}
      </CardContent>
    </Card>
  );
}
