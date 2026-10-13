"use client";

import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import {
  createWebhookEndpoint,
  deleteWebhookEndpoint,
  resendWebhookDelivery,
  rotateWebhookSecret,
  setWebhookEnabled,
  updateWebhookEndpoint,
} from "@/app/actions/webhooks";
import type { ActionState } from "@/app/actions/stores";
import {
  ActionForm,
  ConfirmSubmit,
  CopyField,
  FormStatus,
  SubmissionKey,
  SubmitButton,
  SuccessToast,
  useSubmission,
} from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WEBHOOK_TOPICS, topicKey, type WebhookTopic } from "@/lib/webhook-rules";

/** The topics grouped by what they are about, in the order of `WEBHOOK_TOPICS`. */
const GROUPS = ["order", "product", "customer", "inventory"] as const;

function EndpointFields({ state, url, description, topics }: {
  state: ActionState;
  url?: string;
  description?: string;
  topics?: WebhookTopic[];
}) {
  const t = useTranslations("webhooks");
  const chosen = new Set(topics ?? []);
  return (
    <div className="space-y-4">
      <div className="grid gap-1.5">
        <Label htmlFor="webhook-url">{t("url")}</Label>
        <Input
          id="webhook-url"
          name="url"
          type="url"
          inputMode="url"
          required
          defaultValue={url}
          placeholder="https://example.com/webhooks"
          aria-invalid={state.field === "url" ? true : undefined}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="webhook-description">{t("description")}</Label>
        <Input id="webhook-description" name="description" maxLength={120} defaultValue={description} />
      </div>
      <fieldset aria-invalid={state.field === "topics" ? true : undefined}>
        <legend className="text-sm font-medium text-foreground">{t("topics")}</legend>
        <div className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {GROUPS.map((group) => (
            <div key={group}>
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t(`groups.${group}`)}</p>
              <ul className="mt-1.5 space-y-1.5">
                {WEBHOOK_TOPICS.filter((topic) => topic.startsWith(`${group}.`)).map((topic) => (
                  <li key={topic}>
                    <Label htmlFor={`topic-${topic}`} className="cursor-pointer font-normal text-inksoft">
                      <input
                        id={`topic-${topic}`}
                        type="checkbox"
                        name="topics"
                        value={topic}
                        defaultChecked={chosen.has(topic)}
                        className="size-4 accent-primary"
                      />
                      <span>
                        {t(`topicLabels.${topicKey(topic)}`)}{" "}
                        <code className="text-xs text-muted-foreground">{topic}</code>
                      </span>
                    </Label>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

export function CreateEndpointForm({ storeId }: { storeId: string }) {
  const t = useTranslations("webhooks");
  const [{ state }, formAction] = useSubmission<ActionState>(createWebhookEndpoint, { status: "idle" });
  return (
    <form action={formAction} noValidate>
      <input type="hidden" name="storeId" value={storeId} />
      <SubmissionKey status={state.status} prefix="whe" />
      <EndpointFields state={state} topics={["order.created", "order.paid"]} />
      <FormStatus state={state} />
      <div className="mt-5">
        <SubmitButton pendingLabel={t("adding")}>{t("add")}</SubmitButton>
      </div>
    </form>
  );
}

export function EditEndpointForm({
  storeId,
  endpointId,
  url,
  description,
  topics,
}: {
  storeId: string;
  endpointId: string;
  url: string;
  description: string;
  topics: WebhookTopic[];
}) {
  const t = useTranslations("webhooks");
  return (
    <ActionForm action={updateWebhookEndpoint} submitLabel={t("save")} hidden={{ storeId, endpointId }}>
      {(state) => <EndpointFields state={state} url={url} description={description} topics={topics} />}
    </ActionForm>
  );
}

/** A small form whose one button runs an action, optionally after a confirmation. */
function ButtonForm({
  action,
  hidden,
  children,
  confirm,
  variant = "outline",
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  hidden: Record<string, string>;
  children: ReactNode;
  confirm?: { label: string; question: string };
  variant?: "outline" | "destructive" | "default";
}) {
  const [{ state }, formAction] = useSubmission<ActionState>(action, { status: "idle" });
  return (
    <form action={formAction} className="inline-flex flex-col items-start">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <SuccessToast state={state} />
      {confirm ? (
        <ConfirmSubmit size="sm" variant={variant} confirmLabel={confirm.label} question={confirm.question}>
          {children}
        </ConfirmSubmit>
      ) : (
        <SubmitButton size="sm" variant={variant}>
          {children}
        </SubmitButton>
      )}
      {state.status === "error" ? <FormStatus state={state} /> : null}
    </form>
  );
}

export function EnableEndpointForm({ storeId, endpointId, enabled }: { storeId: string; endpointId: string; enabled: boolean }) {
  const t = useTranslations("webhooks");
  return (
    <ButtonForm
      action={setWebhookEnabled}
      hidden={{ storeId, endpointId, enabled: String(!enabled) }}
      variant={enabled ? "outline" : "default"}
    >
      {enabled ? t("disable") : t("enable")}
    </ButtonForm>
  );
}

export function SecretPanel({ storeId, endpointId, secret }: { storeId: string; endpointId: string; secret: string }) {
  const t = useTranslations("webhooks");
  const [shown, setShown] = useState(false);
  return (
    <div className="space-y-3">
      {shown ? (
        <CopyField value={secret} label={t("copySecret")} />
      ) : (
        <p className="rounded-lg border border-border bg-muted px-3 py-2 font-mono text-xs text-inksoft">
          whsec_••••••••••••••••••••••••
        </p>
      )}
      <div className="flex flex-wrap items-start gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setShown((value) => !value)}>
          {shown ? <EyeOffIcon aria-hidden /> : <EyeIcon aria-hidden />}
          {shown ? t("hideSecret") : t("revealSecret")}
        </Button>
        <ButtonForm
          action={rotateWebhookSecret}
          hidden={{ storeId, endpointId }}
          confirm={{ label: t("rotate"), question: t("rotateQuestion") }}
        >
          {t("rotate")}
        </ButtonForm>
      </div>
    </div>
  );
}

export function DeleteEndpointForm({ storeId, endpointId }: { storeId: string; endpointId: string }) {
  const t = useTranslations("webhooks");
  return (
    <ButtonForm
      action={deleteWebhookEndpoint}
      hidden={{ storeId, endpointId }}
      variant="destructive"
      confirm={{ label: t("delete"), question: t("deleteQuestion") }}
    >
      {t("delete")}
    </ButtonForm>
  );
}

export function ResendForm({ storeId, deliveryId }: { storeId: string; deliveryId: string }) {
  const t = useTranslations("webhooks");
  return (
    <ButtonForm action={resendWebhookDelivery} hidden={{ storeId, deliveryId }}>
      {t("resend")}
    </ButtonForm>
  );
}
