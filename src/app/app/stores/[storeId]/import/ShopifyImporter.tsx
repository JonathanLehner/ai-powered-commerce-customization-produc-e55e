"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  cancelShopifyImport,
  queueShopifyImport,
  shopifyImportProgress,
  startShopifyImport,
  uploadShopifyImportPart,
  type ImportStep,
} from "@/app/actions/shopify-import";
import type { ActionState } from "@/app/actions/stores";
import { ConfirmSubmit, FormStatus, useSubmission } from "@/components/forms";
import { Badge, Callout, ProgressBar, StatCard } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMinorUnits } from "@/i18n/format";
import {
  IMPORT_KINDS,
  chunkRecords,
  detectKind,
  isJobOpen,
  jobIssues,
  jobProgress,
  parseCsv,
  readCustomers,
  readOrders,
  readProducts,
  type CsvTable,
  type ImportIssue,
  type ImportKind,
  type ImportStatus,
  type ShopifyImportJob,
} from "@/lib/shopify";
import { newId } from "@/lib/util";

const TH = "px-3 text-xs font-semibold tracking-wide uppercase text-muted-foreground";
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const POLL_MS = 1_500;

const STATUS_TONE: Record<ImportStatus, "green" | "amber" | "slate" | "rose" | "brand"> = {
  uploading: "slate",
  queued: "brand",
  running: "brand",
  done: "green",
  failed: "rose",
  cancelled: "slate",
};

type Loaded = { name: string; table: CsvTable };

function IssuesTable({ issues, limit = 100 }: { issues: ImportIssue[]; limit?: number }) {
  const t = useTranslations("import");
  if (issues.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">{t("issuesTitle", { count: issues.length })}</h3>
      <div className="max-h-96 overflow-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className={TH}>{t("columns.file")}</TableHead>
              <TableHead className={TH}>{t("columns.line")}</TableHead>
              <TableHead className={TH}>{t("columns.record")}</TableHead>
              <TableHead className={TH}>{t("columns.problem")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {issues.slice(0, limit).map((issue, index) => (
              <TableRow key={`${issue.kind}-${issue.line}-${issue.key}-${index}`}>
                <TableCell className="px-3 text-xs">{t(`files.${issue.kind}.short`)}</TableCell>
                <TableCell className="px-3 text-xs tabular-nums">{issue.line || "–"}</TableCell>
                <TableCell className="max-w-48 truncate px-3 font-mono text-xs">{issue.ref || "–"}</TableCell>
                <TableCell className="px-3 text-xs">
                  <span className="flex items-start gap-2">
                    <Badge tone={issue.severity === "error" ? "rose" : "amber"}>
                      {issue.severity === "error" ? t("skipped") : t("warning")}
                    </Badge>
                    <span>{t(`issues.${issue.key}`, issue.values ?? {})}</span>
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {issues.length > limit ? <p className="text-xs text-muted-foreground">{t("moreIssues", { count: issues.length - limit })}</p> : null}
    </div>
  );
}

function CancelImport({ storeId, importId }: { storeId: string; importId: string }) {
  const t = useTranslations("import");
  const [{ state }, formAction] = useSubmission<ActionState>(cancelShopifyImport, { status: "idle" });
  return (
    <form action={formAction}>
      <input type="hidden" name="storeId" value={storeId} />
      <input type="hidden" name="importId" value={importId} />
      <ConfirmSubmit size="sm" variant="outline" confirmLabel={t("cancel")} question={t("cancelQuestion")}>
        {t("cancel")}
      </ConfirmSubmit>
      {state.status === "error" ? <FormStatus state={state} /> : null}
    </form>
  );
}

function Report({ job }: { job: ShopifyImportJob }) {
  const t = useTranslations("import");
  const kinds = IMPORT_KINDS.filter((kind) => job.counts[kind] > 0);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className={TH}>{t("columns.file")}</TableHead>
          <TableHead className={TH}>{t("columns.created")}</TableHead>
          <TableHead className={TH}>{t("columns.updated")}</TableHead>
          <TableHead className={TH}>{t("columns.failed")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {kinds.map((kind) => (
          <TableRow key={kind}>
            <TableCell className="px-3 font-medium">{t(`files.${kind}.short`)}</TableCell>
            <TableCell className="px-3 tabular-nums">{job.created[kind]}</TableCell>
            <TableCell className="px-3 tabular-nums">{job.updated[kind]}</TableCell>
            <TableCell className="px-3 tabular-nums">{job.failed[kind]}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function ShopifyImporter({
  storeId,
  currency,
  decimals,
  recent,
}: {
  storeId: string;
  currency: string;
  decimals: number;
  recent: ShopifyImportJob[];
}) {
  const t = useTranslations("import");
  const format = useFormatter();
  const router = useRouter();
  const [files, setFiles] = useState<Partial<Record<ImportKind, Loaded>>>({});
  const [fileErrors, setFileErrors] = useState<Partial<Record<ImportKind, string>>>({});
  const [phase, setPhase] = useState<"select" | "uploading" | "watching">(() =>
    recent[0] && isJobOpen(recent[0]) ? "watching" : "select",
  );
  const [job, setJob] = useState<ShopifyImportJob | null>(() => (recent[0] && isJobOpen(recent[0]) ? recent[0] : null));
  const [uploaded, setUploaded] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [submissionKey, setSubmissionKey] = useState(() => newId("imp"));

  const preview = useMemo(() => {
    const products = files.products ? readProducts(files.products.table, decimals) : null;
    const customers = files.customers ? readCustomers(files.customers.table) : null;
    const orders = files.orders ? readOrders(files.orders.table, currency) : null;
    return {
      products,
      customers,
      orders,
      issues: [...(products?.issues ?? []), ...(customers?.issues ?? []), ...(orders?.issues ?? [])],
    };
  }, [files, decimals, currency]);

  // Watches a running import until it settles; each read also moves it along.
  const open = phase === "watching" && job !== null && isJobOpen(job);
  useEffect(() => {
    if (!open || !job) return;
    const timer = setTimeout(async () => {
      const next = await shopifyImportProgress(storeId, job.id).catch(() => null);
      if (next?.ok) {
        setJob(next.job);
        if (!isJobOpen(next.job)) router.refresh();
      } else {
        setJob({ ...job });
      }
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [open, job, storeId, router]);

  async function choose(kind: ImportKind, file: File | undefined) {
    setFileErrors((prev) => ({ ...prev, [kind]: undefined }));
    if (!file) {
      setFiles((prev) => ({ ...prev, [kind]: undefined }));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setFileErrors((prev) => ({ ...prev, [kind]: t("fileTooBig", { max: 25 }) }));
      return;
    }
    const table = parseCsv(await file.text());
    if (detectKind(table.header) !== kind) {
      setFileErrors((prev) => ({ ...prev, [kind]: t(`files.${kind}.wrong`) }));
      setFiles((prev) => ({ ...prev, [kind]: undefined }));
      return;
    }
    setFiles((prev) => ({ ...prev, [kind]: { name: file.name, table } }));
  }

  async function run() {
    setPhase("uploading");
    setError(null);
    const fail = (step: ImportStep | null) => {
      setError(step && !step.ok ? step.message : t("startFailed"));
      setPhase("select");
    };
    try {
      const started = await startShopifyImport(storeId, submissionKey);
      if (!started.ok) return fail(started);
      const plan = IMPORT_KINDS.flatMap((kind) => {
        const loaded = files[kind];
        return loaded ? chunkRecords(kind, loaded.table).map((records, part) => ({ kind, part, header: loaded.table.header, records })) : [];
      });
      setUploaded({ done: 0, total: plan.length });
      for (const [index, part] of plan.entries()) {
        const sent = await uploadShopifyImportPart(storeId, started.job.id, part);
        if (!sent.ok) return fail(sent);
        setUploaded({ done: index + 1, total: plan.length });
      }
      const queued = await queueShopifyImport(storeId, started.job.id);
      if (!queued.ok) return fail(queued);
      setJob(queued.job);
      setPhase("watching");
      setFiles({});
      setSubmissionKey(newId("imp"));
    } catch {
      fail(null);
    }
  }

  const products = preview.products?.products ?? [];
  const variantCount = products.reduce((sum, p) => sum + p.variants.length, 0);
  const imageCount = products.reduce((sum, p) => sum + p.images.length, 0);
  const canStart = products.length > 0 && phase === "select";

  if (phase === "watching" && job) {
    const issues = jobIssues(job);
    const running = isJobOpen(job);
    return (
      <Card asChild>
        <section aria-live="polite">
          <CardHeader>
            <CardTitle asChild>
              <h2 className="flex items-center gap-2">
                {running ? t("runningTitle") : t("reportTitle")}
                <Badge tone={STATUS_TONE[job.status]}>{t(`status.${job.status}`)}</Badge>
              </h2>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {running ? t("runningBody") : t("finishedAt", { time: format.dateTime(new Date(job.finishedAt ?? job.updatedAt), { dateStyle: "medium", timeStyle: "short" }) })}
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <ProgressBar value={jobProgress(job)} label={t("progress", { pct: jobProgress(job) })} />
            <Report job={job} />
            <IssuesTable issues={issues} />
            <div className="flex flex-wrap gap-2">
              {running ? (
                <CancelImport storeId={storeId} importId={job.id} />
              ) : (
                <Button
                  type="button"
                  onClick={() => {
                    setJob(null);
                    setPhase("select");
                  }}
                >
                  {t("importMore")}
                </Button>
              )}
            </div>
          </CardContent>
        </section>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card asChild>
        <section>
          <CardHeader>
            <CardTitle asChild>
              <h2>{t("filesTitle")}</h2>
            </CardTitle>
            <p className="text-sm text-muted-foreground">{t("filesBody")}</p>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-3">
            {IMPORT_KINDS.map((kind) => (
              <div key={kind} className="grid content-start gap-1.5">
                <Label htmlFor={`file-${kind}`}>
                  {t(`files.${kind}.label`)}{" "}
                  {kind !== "products" ? <span className="font-normal text-muted-foreground">{t("optional")}</span> : null}
                </Label>
                <Input
                  id={`file-${kind}`}
                  type="file"
                  accept=".csv,text/csv"
                  disabled={phase !== "select"}
                  onChange={(event) => choose(kind, event.currentTarget.files?.[0])}
                  aria-invalid={fileErrors[kind] ? true : undefined}
                  aria-describedby={`file-${kind}-hint`}
                />
                <p id={`file-${kind}-hint`} className={fileErrors[kind] ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                  {fileErrors[kind] ?? (files[kind] ? files[kind]?.name : t(`files.${kind}.hint`))}
                </p>
              </div>
            ))}
          </CardContent>
        </section>
      </Card>

      {preview.products || preview.customers || preview.orders ? (
        <Card asChild>
          <section>
            <CardHeader>
              <CardTitle asChild>
                <h2>{t("previewTitle")}</h2>
              </CardTitle>
              <p className="text-sm text-muted-foreground">{t("previewBody")}</p>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <StatCard label={t("stats.products")} value={format.number(products.length)} />
                <StatCard label={t("stats.variants")} value={format.number(variantCount)} />
                <StatCard label={t("stats.images")} value={format.number(imageCount)} />
                <StatCard label={t("stats.customers")} value={format.number(preview.customers?.customers.length ?? 0)} />
                <StatCard label={t("stats.orders")} value={format.number(preview.orders?.orders.length ?? 0)} />
              </div>

              {products.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className={TH}>{t("columns.product")}</TableHead>
                        <TableHead className={TH}>{t("columns.options")}</TableHead>
                        <TableHead className={TH}>{t("columns.price")}</TableHead>
                        <TableHead className={TH}>{t("columns.stock")}</TableHead>
                        <TableHead className={TH}>{t("columns.images")}</TableHead>
                        <TableHead className={TH}>{t("columns.seo")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {products.slice(0, 8).map((product) => {
                        const prices = product.variants.map((v) => v.price);
                        const low = Math.min(...prices);
                        const high = Math.max(...prices);
                        const tracked = product.variants.some((v) => v.quantity !== null);
                        return (
                          <TableRow key={product.handle}>
                            <TableCell className="px-3">
                              <span className="block font-medium text-foreground">{product.title}</span>
                              <span className="block font-mono text-xs text-muted-foreground">/products/{product.handle}</span>
                            </TableCell>
                            <TableCell className="px-3 text-xs">
                              {product.options.length > 0 ? product.options.join(", ") : "–"}
                              <span className="block text-muted-foreground">{t("variantCount", { count: product.variants.length })}</span>
                            </TableCell>
                            <TableCell className="px-3 text-xs tabular-nums">
                              {low === high
                                ? formatMinorUnits(format, low, currency)
                                : `${formatMinorUnits(format, low, currency)} – ${formatMinorUnits(format, high, currency)}`}
                            </TableCell>
                            <TableCell className="px-3 text-xs tabular-nums">
                              {tracked ? format.number(product.variants.reduce((sum, v) => sum + Math.max(0, v.quantity ?? 0), 0)) : t("notTracked")}
                            </TableCell>
                            <TableCell className="px-3 text-xs tabular-nums">{product.images.length}</TableCell>
                            <TableCell className="max-w-56 truncate px-3 text-xs">{product.seoTitle || "–"}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : null}
              {products.length > 8 ? <p className="text-xs text-muted-foreground">{t("moreProducts", { count: products.length - 8 })}</p> : null}

              <IssuesTable issues={preview.issues} />

              {error ? <Callout tone="rose">{error}</Callout> : null}
              {phase === "uploading" ? (
                <ProgressBar
                  value={uploaded.total > 0 ? Math.round((uploaded.done / uploaded.total) * 100) : 0}
                  label={t("uploading")}
                />
              ) : null}
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" onClick={run} disabled={!canStart}>
                  {phase === "uploading" ? t("starting") : t("start", { count: products.length })}
                </Button>
                {!files.products ? <p className="text-xs text-muted-foreground">{t("productsRequired")}</p> : null}
              </div>
            </CardContent>
          </section>
        </Card>
      ) : null}

      {recent.length > 0 ? (
        <Card asChild>
          <section>
            <CardHeader>
              <CardTitle asChild>
                <h2>{t("recentTitle")}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className={TH}>{t("columns.started")}</TableHead>
                    <TableHead className={TH}>{t("columns.status")}</TableHead>
                    <TableHead className={TH}>{t("columns.summary")}</TableHead>
                    <TableHead className={TH}>
                      <span className="sr-only">{t("columns.actions")}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recent.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="px-3 text-xs">
                        {format.dateTime(new Date(entry.createdAt), { dateStyle: "medium", timeStyle: "short" })}
                        <span className="block text-muted-foreground">{entry.createdByName}</span>
                      </TableCell>
                      <TableCell className="px-3">
                        <Badge tone={STATUS_TONE[entry.status]}>{t(`status.${entry.status}`)}</Badge>
                      </TableCell>
                      <TableCell className="px-3 text-xs">
                        {t("summary", {
                          products: entry.created.products + entry.updated.products,
                          customers: entry.created.customers + entry.updated.customers,
                          orders: entry.created.orders,
                        })}
                      </TableCell>
                      <TableCell className="px-3 text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setJob(entry);
                            setPhase("watching");
                          }}
                        >
                          {t("viewReport")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </section>
        </Card>
      ) : null}
    </div>
  );
}
