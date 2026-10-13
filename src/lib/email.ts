import "server-only";
import { after } from "next/server";
import { recordAudit } from "./data";
import type { BuiltEmail } from "./email-templates";

/**
 * Sending one transactional email.
 *
 * The provider is configured with environment variables — `EMAIL_PROVIDER`
 * (`clawcorp` for ClawCorp Mail, or `resend`), `EMAIL_API_KEY` and
 * `EMAIL_FROM`. ClawCorp Mail takes a `ccm_…` key with the send scope from its
 * Settings → API keys, and `EMAIL_API_URL` overrides its address. Where none
 * is configured, which
 * is every preview and development run, the message is logged and written to
 * the store's activity history instead, so the team can see exactly what would
 * have gone out rather than hitting a failure.
 *
 * Nothing here is allowed to break the thing that triggered it: a checkout, a
 * shipment or an invitation succeeds whether or not the email does. The work is
 * handed to `after()` so the response goes out first, and every failure is
 * swallowed into the activity entry.
 */

export interface EmailDispatch {
  to: string;
  message: BuiltEmail;
  /** What the email is, for the activity entry: "order confirmation". */
  kind: string;
  /** Where a reply goes, when that is someone other than the sender. */
  replyTo?: string | null;
  storeId?: string | null;
  agencyId?: string | null;
  entity?: string | null;
  entityId?: string | null;
}

type ProviderName = "clawcorp" | "resend";

interface Provider {
  name: ProviderName;
  apiKey: string;
  from: string;
}

const CLAWCORP_MAIL_URL = "https://mailbox-for-startups-6e48.clawcorp.ai";

function provider(): Provider | null {
  const name = (process.env.EMAIL_PROVIDER ?? "").trim().toLowerCase();
  const apiKey = (process.env.EMAIL_API_KEY ?? "").trim();
  const from = (process.env.EMAIL_FROM ?? "").trim();
  if ((name !== "clawcorp" && name !== "resend") || !apiKey || !from) return null;
  return { name, apiKey, from };
}

/** The provider's send request for one message; both take the same JSON shape apart from reply-to. */
function sendRequest(configured: Provider, to: string, dispatch: EmailDispatch): [string, RequestInit] {
  const replyTo = dispatch.replyTo && EMAIL.test(dispatch.replyTo) ? dispatch.replyTo : null;
  const url =
    configured.name === "clawcorp"
      ? `${(process.env.EMAIL_API_URL ?? "").trim().replace(/\/+$/, "") || CLAWCORP_MAIL_URL}/api/v1/messages`
      : "https://api.resend.com/emails";
  return [
    url,
    {
      method: "POST",
      headers: { authorization: `Bearer ${configured.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        // ClawCorp Mail takes a bare address; the display name comes from its mailbox.
        from: configured.name === "clawcorp" ? (/<([^>]+)>/.exec(configured.from)?.[1] ?? configured.from) : configured.from,
        to: [to],
        subject: dispatch.message.subject,
        html: dispatch.message.html,
        text: dispatch.message.text,
        ...(replyTo ? (configured.name === "clawcorp" ? { replyTo } : { reply_to: replyTo }) : {}),
      }),
      cache: "no-store",
    },
  ];
}

/** True when a provider is configured, which is what the workspace tells people. */
export function emailConfigured(): boolean {
  return provider() !== null;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Queues one email. Returns immediately and never throws, so a caller can sit
 * directly in a checkout or a server action without a try/catch of its own.
 */
export function sendEmail(dispatch: EmailDispatch): void {
  try {
    after(() => deliver(dispatch));
  } catch {
    // Outside a request scope — a script, or a call after the response — there
    // is nothing to defer to, so it goes out inline. `deliver` never rejects.
    void deliver(dispatch);
  }
}

async function deliver(dispatch: EmailDispatch): Promise<void> {
  const to = dispatch.to.trim();
  if (!EMAIL.test(to)) {
    record(dispatch, "email.skipped", `No valid address for the ${dispatch.kind} email`);
    return;
  }

  const configured = provider();
  if (!configured) {
    console.info(
      `[email] no provider configured — ${dispatch.kind} to ${to}: ${dispatch.message.subject}\n${dispatch.message.text}`,
    );
    record(
      dispatch,
      "email.logged",
      `No email provider configured. The ${dispatch.kind} email to ${to} was logged, not sent`,
      to,
    );
    return;
  }

  try {
    const response = await fetch(...sendRequest(configured, to, dispatch));
    if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
    record(dispatch, "email.sent", `Sent the ${dispatch.kind} email to ${to}`, to);
  } catch (error) {
    console.error(`[email] ${dispatch.kind} to ${to} could not be sent`, error);
    record(dispatch, "email.failed", `The ${dispatch.kind} email to ${to} could not be sent`, to);
  }
}

function record(dispatch: EmailDispatch, action: string, summary: string, to?: string): void {
  recordAudit({
    category: "email",
    action,
    summary,
    storeId: dispatch.storeId ?? null,
    agencyId: dispatch.agencyId ?? null,
    actorId: "system",
    actorName: "Parcelith email",
    entity: dispatch.entity ?? null,
    entityId: dispatch.entityId ?? null,
    meta: { kind: dispatch.kind, to: to ?? null, subject: dispatch.message.subject },
  });
}

/**
 * The absolute address of this deployment, for the links inside an email.
 *
 * `APP_ORIGIN` wins where it is set — a scheduled send has no request to read —
 * and otherwise the origin the action was called on is used, exactly as the
 * team page does for the invitation link it shows on screen.
 */
export async function siteOrigin(): Promise<string> {
  const configured = (process.env.APP_ORIGIN ?? "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  try {
    const { headers } = await import("next/headers");
    const list = await headers();
    const host = list.get("host") ?? "";
    if (!host) return "";
    const proto = list.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    return `${proto}://${host}`;
  } catch {
    return "";
  }
}
