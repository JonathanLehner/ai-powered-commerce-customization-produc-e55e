import "server-only";
import { after } from "next/server";
import { recordAudit } from "./data";
import type { BuiltEmail } from "./email-templates";

/**
 * Sending one transactional email.
 *
 * The provider is configured with environment variables — `EMAIL_PROVIDER`
 * (`resend`), `EMAIL_API_KEY` and `EMAIL_FROM`. Where none is configured, which
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
  storeId?: string | null;
  agencyId?: string | null;
  entity?: string | null;
  entityId?: string | null;
}

interface Provider {
  name: string;
  apiKey: string;
  from: string;
}

function provider(): Provider | null {
  const name = (process.env.EMAIL_PROVIDER ?? "").trim().toLowerCase();
  const apiKey = (process.env.EMAIL_API_KEY ?? "").trim();
  const from = (process.env.EMAIL_FROM ?? "").trim();
  if (name !== "resend" || !apiKey || !from) return null;
  return { name, apiKey, from };
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
      `No email provider configured — the ${dispatch.kind} email to ${to} was logged, not sent`,
      to,
    );
    return;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${configured.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: configured.from,
        to: [to],
        subject: dispatch.message.subject,
        html: dispatch.message.html,
        text: dispatch.message.text,
      }),
    });
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
