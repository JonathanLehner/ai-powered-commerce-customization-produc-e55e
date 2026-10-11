"use client";

import { useTranslations } from "next-intl";
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
  waitDays: number;
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
  waitDays,
  requestedAt,
  lastSentAt,
  reminders,
  stale,
  canManage,
}: ApprovalPanelProps) {
  const [changing, setChanging] = useState(false);
  const t = useTranslations("campaign");

  const mailto = approverEmail
    ? `mailto:${encodeURIComponent(approverEmail)}?subject=${encodeURIComponent(
        t("mailSubject", { code: campaignCode }),
      )}&body=${encodeURIComponent(
        t("mailBody", { name: approverName ? ` ${approverName}` : "", code: campaignCode, link: approvalLink }),
      )}`
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle asChild>
          <h2>{t("approval")}</h2>
        </CardTitle>
        <CardAction>
          <Badge tone={stale ? "rose" : "amber"}>{waitLabel}</Badge>
        </CardAction>
      </CardHeader>

      <CardContent>
      <p className="text-sm text-inksoft">
        <span className="font-medium text-foreground">{approverName || t("noApprover")}</span>
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
        {t("sentOn", { requested: requestedAt, last: lastSentAt })}
        {reminders > 0 ? t("askedAgain", { count: reminders }) : ""}.
      </p>
      {stale ? (
        <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {t("staleNote", { days: waitDays })}
        </p>
      ) : null}

      <div className="mt-4">
        <p className="text-sm leading-none font-medium text-foreground select-none">
          {t("approverLink")}
        </p>
        <CopyField value={approvalLink} />
      </div>

      {canManage ? (
        <>
          <ActionForm
            action={resendApprovalRequest}
            hidden={{ storeId, campaignId }}
            submitLabel={t("resend")}
            pendingLabel={t("recording")}
            submitVariant="outline" submitSize="sm"
            className="mt-5 border-t border-border pt-5"
            footer={
              mailto ? (
                <Button asChild variant="ghost" size="sm">
                  <a href={mailto}>{t("openMail")}</a>
                </Button>
              ) : null
            }
          >
            <p className="text-sm text-muted-foreground">
              {t("resendNote")}
            </p>
          </ActionForm>

          <div className="mt-5 border-t border-border pt-5">
            {changing ? (
              <ActionForm
                action={changeCampaignApprover}
                hidden={{ storeId, campaignId }}
                submitLabel={t("changeApprover")}
                pendingLabel={t("saving")}
                submitSize="sm"
                footer={
                  <Button type="button" variant="ghost" size="sm" onClick={() => setChanging(false)}>
                    {t("cancel")}
                  </Button>
                }
              >
                {(state) => (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">{t("newApproverNote")}</p>
                    <Field label={t("newApprover")} htmlFor="approverName">
                      <Input
                        id="approverName"
                        name="approverName"
                        defaultValue=""
                        placeholder="Sam Okafor"
                        className="mt-1.5"
                        aria-invalid={state.field === "approverName" ? true : undefined}
                      />
                    </Field>
                    <Field label={t("theirEmail")} htmlFor="approverEmail">
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
                      label={t("reason")}
                      htmlFor="reason"
                      hint={t("optional")}
                    >
                      <Input
                        id="reason"
                        name="reason"
                        placeholder={t("reasonPlaceholder")}
                        className="mt-1.5"
                      />
                    </Field>
                  </div>
                )}
              </ActionForm>
            ) : (
              <Button type="button" variant="ghost" size="sm" onClick={() => setChanging(true)}>
                {t("changeApprover")}
              </Button>
            )}
          </div>
        </>
      ) : null}
      </CardContent>
    </Card>
  );
}
