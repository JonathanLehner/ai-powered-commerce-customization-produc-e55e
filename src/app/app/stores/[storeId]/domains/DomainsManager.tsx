"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { connectDomain, refreshDomains, removeDomain, setPrimaryDomain } from "@/app/actions/domains";
import type { ActionState } from "@/app/actions/stores";
import { CopyCode } from "@/components/CopyCode";
import { ActionForm, ConfirmSubmit, FormStatus, SubmitButton, SuccessToast, useSubmission } from "@/components/forms";
import { Badge, Callout, EmptyState } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { companionHostname, dnsRecordFor, normalizeHostname, type DomainStatus, type StoreDomain } from "@/lib/domains";
import { SITE_ORIGIN } from "@/lib/seo";

const TH = "px-3 text-xs font-semibold tracking-wide uppercase text-muted-foreground";

/** How often a domain still verifying is checked, and for how long. */
const POLL_MS = 15_000;
const POLL_LIMIT = 40;

const STATUS_TONE: Record<DomainStatus, "green" | "amber" | "slate" | "rose"> = {
  active: "green",
  pending: "amber",
  pending_setup: "slate",
  failed: "rose",
};

function sslKey(status: string | null): "sslActive" | "sslPending" | "sslFailed" | "sslNone" {
  if (!status) return "sslNone";
  if (status === "active") return "sslActive";
  if (status.endsWith("_timed_out") || status === "expired" || status === "deleted") return "sslFailed";
  return "sslPending";
}

/** A small form for one domain's button, with its own result line. */
function DomainAction({
  action,
  storeId,
  domainId,
  children,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  storeId: string;
  domainId: string;
  children: React.ReactNode;
}) {
  const [{ state }, formAction] = useSubmission<ActionState>(action, { status: "idle" });
  return (
    <form action={formAction} className="contents">
      <input type="hidden" name="storeId" value={storeId} />
      <input type="hidden" name="domainId" value={domainId} />
      {children}
      <SuccessToast state={state} />
      {state.status === "error" ? (
        <div className="basis-full">
          <FormStatus state={state} />
        </div>
      ) : null}
    </form>
  );
}

function DnsTable({ domain, target }: { domain: StoreDomain; target: string }) {
  const t = useTranslations("domains");
  const record = dnsRecordFor(domain.hostname, target);
  const rows = [
    { type: record.type, name: record.name, value: record.value },
    ...(domain.ownership ? [{ type: "TXT", name: domain.ownership.name, value: domain.ownership.value }] : []),
  ];
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-foreground">{t("dnsTitle")}</p>
        <p className="text-xs text-muted-foreground">{t("dnsBody")}</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className={TH}>{t("columns.type")}</TableHead>
            <TableHead className={TH}>{t("columns.name")}</TableHead>
            <TableHead className={TH}>{t("columns.value")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={`${row.type}-${row.name}`}>
              <TableCell className="px-3 font-mono text-xs">{row.type}</TableCell>
              <TableCell className="px-3 font-mono text-xs break-all">{row.name}</TableCell>
              <TableCell className="min-w-56 px-3">
                <CopyCode value={row.value} label={t("copyValue", { type: row.type })} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {record.apex ? <p className="text-xs text-muted-foreground">{t("apexNote")}</p> : null}
      {domain.ownership ? <p className="text-xs text-muted-foreground">{t("ownershipNote")}</p> : null}
    </div>
  );
}

export function DomainsManager({
  storeId,
  slug,
  domains: saved,
  target,
  setupPending,
  suggested,
}: {
  storeId: string;
  slug: string;
  domains: StoreDomain[];
  target: string;
  setupPending: boolean;
  /** A domain the store recorded before domains were connected here, offered as the first one. */
  suggested: string | null;
}) {
  const t = useTranslations("domains");
  const format = useFormatter();
  // The page's own list after each save, and the polled list in between.
  const [domains, setDomains] = useState(saved);
  const [shown, setShown] = useState(saved);
  if (shown !== saved) {
    setShown(saved);
    setDomains(saved);
  }
  const [hostname, setHostname] = useState(suggested ?? "");
  const [checking, startChecking] = useTransition();
  const [polls, setPolls] = useState(0);

  const verifying = !setupPending && domains.some((domain) => domain.status === "pending");
  useEffect(() => {
    if (!verifying || polls >= POLL_LIMIT) return;
    const timer = setTimeout(() => {
      refreshDomains(storeId)
        .then(setDomains)
        .catch(() => {})
        .finally(() => setPolls((n) => n + 1));
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [verifying, polls, storeId]);

  const companion = (() => {
    const normalized = normalizeHostname(hostname);
    return normalized ? companionHostname(normalized) : null;
  })();
  const platformAddress = `${SITE_ORIGIN.replace(/^https:\/\//, "")}/s/${slug}`;

  function checkNow() {
    startChecking(async () => {
      try {
        setDomains(await refreshDomains(storeId));
        setPolls(0);
      } catch {
        // The list stays as it was; the next check tries again.
      }
    });
  }

  return (
    <div className="space-y-6">
      {setupPending ? (
        <Callout tone="amber" title={t("setupPendingTitle")}>
          {t("setupPendingBody")}
        </Callout>
      ) : null}

      <Card asChild>
        <section>
          <CardHeader>
            <CardTitle asChild>
              <h2>{t("connectTitle")}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm
              action={connectDomain}
              submitLabel={t("connect")}
              pendingLabel={t("connecting")}
              hidden={{ storeId }}
            >
              {(state) => (
                <div className="grid max-w-xl gap-4">
                  <div className="grid gap-1.5">
                    <Label htmlFor="hostname">{t("hostname")}</Label>
                    <Input
                      id="hostname"
                      name="hostname"
                      value={hostname}
                      onChange={(event) => setHostname(event.currentTarget.value)}
                      placeholder="shop.example.com"
                      autoComplete="off"
                      spellCheck={false}
                      aria-invalid={state.field === "hostname" ? true : undefined}
                      aria-describedby="hostname-hint"
                    />
                    <p id="hostname-hint" className="text-xs text-muted-foreground">
                      {t("hostnameHint")}
                    </p>
                  </div>
                  {companion ? (
                    <Label className="flex items-center gap-2 font-normal">
                      <Checkbox name="includeCompanion" defaultChecked />
                      <span>{t("includeCompanion", { domain: companion })}</span>
                    </Label>
                  ) : null}
                  {domains.length > 0 ? (
                    <Label className="flex items-center gap-2 font-normal">
                      <Checkbox name="primary" />
                      <span>{t("makePrimary")}</span>
                    </Label>
                  ) : null}
                </div>
              )}
            </ActionForm>
          </CardContent>
        </section>
      </Card>

      <section className="space-y-4" aria-labelledby="domains-list">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="domains-list" className="text-lg font-semibold tracking-tight text-foreground">
              {t("listTitle")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("redirectNote", { address: platformAddress })}</p>
          </div>
          {domains.length > 0 && !setupPending ? (
            <Button type="button" variant="outline" size="sm" onClick={checkNow} disabled={checking}>
              {checking ? t("checking") : t("checkNow")}
            </Button>
          ) : null}
        </div>

        {domains.length === 0 ? (
          <EmptyState title={t("emptyTitle")} description={t("emptyBody", { address: platformAddress })} />
        ) : (
          domains.map((domain) => (
            <Card key={domain.id} asChild>
              <article>
                <CardHeader>
                  <CardTitle asChild>
                    <h3 className="flex flex-wrap items-center gap-2 break-all">
                      {domain.hostname}
                      {domain.primary ? <Badge tone="brand">{t("primary")}</Badge> : null}
                    </h3>
                  </CardTitle>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <Badge tone={STATUS_TONE[domain.status]}>{t(`status.${domain.status}`)}</Badge>
                    <span>{t(sslKey(domain.sslStatus))}</span>
                    {domain.checkedAt ? (
                      <span>{t("lastChecked", { time: format.relativeTime(new Date(domain.checkedAt)) })}</span>
                    ) : null}
                  </p>
                  <CardAction className="flex flex-wrap items-center justify-end gap-2">
                    {!domain.primary ? (
                      <DomainAction action={setPrimaryDomain} storeId={storeId} domainId={domain.id}>
                        <SubmitButton variant="outline" size="sm" pendingLabel={t("working")}>
                          {t("setPrimary")}
                        </SubmitButton>
                      </DomainAction>
                    ) : null}
                    <DomainAction action={removeDomain} storeId={storeId} domainId={domain.id}>
                      <ConfirmSubmit size="sm" variant="outline" confirmLabel={t("remove")} question={t("removeQuestion")}>
                        {t("remove")}
                      </ConfirmSubmit>
                    </DomainAction>
                  </CardAction>
                </CardHeader>
                <CardContent className="space-y-4">
                  {domain.status !== "active" ? <DnsTable domain={domain} target={target} /> : null}
                  {domain.verificationErrors.length > 0 ? (
                    <Callout tone="rose" title={t("errorsTitle")}>
                      <ul className="list-disc space-y-1 pl-4">
                        {domain.verificationErrors.map((error) => (
                          <li key={error}>{error}</li>
                        ))}
                      </ul>
                    </Callout>
                  ) : null}
                  {domain.status === "active" ? (
                    <p className="text-sm text-muted-foreground">
                      {domain.primary ? t("activePrimary") : t("activeRedirects")}
                    </p>
                  ) : null}
                </CardContent>
              </article>
            </Card>
          ))
        )}
      </section>
    </div>
  );
}
