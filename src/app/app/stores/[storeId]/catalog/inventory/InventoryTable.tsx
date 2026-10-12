"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveInventoryRow } from "@/app/actions/inventory";
import { Badge } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { INVENTORY_POLICIES, MANUAL_REASONS, type InventoryRow, type StockState } from "@/lib/inventory-rules";

const STATE_TONES: Record<StockState, "green" | "amber" | "rose" | "slate"> = {
  in_stock: "green",
  low: "amber",
  out: "rose",
  untracked: "slate",
};

/**
 * Every variant on one screen, edited where it is listed: tracking, what
 * happens once it runs out, and the units available. A row saves on its own,
 * and its button locks until the save has answered.
 */
export function InventoryTable({
  storeId,
  rows,
  canEdit,
  threshold,
}: {
  storeId: string;
  rows: InventoryRow[];
  canEdit: boolean;
  threshold: number;
}) {
  const t = useTranslations("inventory");
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">{t("colVariant")}</TableHead>
            <TableHead>{t("colTracked")}</TableHead>
            <TableHead>{t("colPolicy")}</TableHead>
            <TableHead className="text-right">{t("colCommitted")}</TableHead>
            <TableHead>{t("colAvailable")}</TableHead>
            <TableHead className="pr-4">
              <span className="sr-only">{t("colActions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <InventoryLine
              key={`${row.productId}:${row.variantId}`}
              storeId={storeId}
              initial={row}
              canEdit={canEdit}
              threshold={threshold}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function InventoryLine({
  storeId,
  initial,
  canEdit,
  threshold,
}: {
  storeId: string;
  initial: InventoryRow;
  canEdit: boolean;
  threshold: number;
}) {
  const t = useTranslations("inventory");
  const router = useRouter();
  const [row, setRow] = useState(initial);
  const [tracked, setTracked] = useState(initial.tracked);
  const [policy, setPolicy] = useState<string>(initial.policy);
  const [available, setAvailable] = useState(String(initial.available));
  const [reason, setReason] = useState<string>("correction");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const quantityChanged = available.trim() !== String(row.available);
  const dirty = tracked !== row.tracked || policy !== row.policy || quantityChanged;
  const label = `${row.productName} · ${row.variantName}`;

  function save() {
    if (pending || !dirty) return;
    setError(null);
    startTransition(async () => {
      const result = await saveInventoryRow(storeId, {
        productId: row.productId,
        variantId: row.variantId,
        tracked,
        policy,
        available: quantityChanged ? available : "",
        reason,
      });
      if (result.status !== "success" || !result.row) {
        setError(result.message ?? t("saveFailed"));
        return;
      }
      setRow(result.row);
      setTracked(result.row.tracked);
      setPolicy(result.row.policy);
      setAvailable(String(result.row.available));
      toast.success(result.message ?? t("saveFailed"));
      router.refresh();
    });
  }

  return (
    <TableRow data-state={dirty ? "selected" : undefined}>
      <TableCell className="max-w-[20rem] pl-4">
        <Link
          href={`/app/stores/${storeId}/catalog/${row.productId}`}
          className="block truncate text-sm font-medium text-foreground hover:underline"
        >
          {row.productName}
        </Link>
        <p className="truncate text-xs text-muted-foreground">
          {row.variantName}
          {row.sku ? <span className="ml-2 font-mono">{row.sku}</span> : null}
        </p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <Badge tone={STATE_TONES[row.state]}>{t(`states.${row.state}`, { threshold })}</Badge>
          {!row.enabled ? <Badge tone="slate">{t("variantOff")}</Badge> : null}
        </div>
      </TableCell>
      <TableCell>
        <Switch
          checked={tracked}
          onCheckedChange={setTracked}
          disabled={!canEdit || pending}
          aria-label={t("trackLabel", { variant: label })}
        />
      </TableCell>
      <TableCell>
        <Select value={policy} onValueChange={setPolicy} disabled={!canEdit || pending || !tracked}>
          <SelectTrigger size="sm" className="w-40" aria-label={t("policyLabel", { variant: label })}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INVENTORY_POLICIES.map((key) => (
              <SelectItem key={key} value={key}>
                {t(`policies.${key}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">{row.committed}</TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="number"
            inputMode="numeric"
            step={1}
            value={available}
            onChange={(event) => setAvailable(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                save();
              }
            }}
            disabled={!canEdit || pending || !tracked}
            aria-label={t("availableLabel", { variant: label })}
            aria-invalid={error ? true : undefined}
            className="h-8 w-24 tabular-nums"
          />
          {quantityChanged && canEdit ? (
            <Select value={reason} onValueChange={setReason} disabled={pending}>
              <SelectTrigger size="sm" className="w-36" aria-label={t("reasonLabel")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MANUAL_REASONS.map((key) => (
                  <SelectItem key={key} value={key}>
                    {t(`reasons.${key}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
        {error ? (
          <p role="status" className="mt-1 text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </TableCell>
      <TableCell className="pr-4 text-right">
        {canEdit ? (
          <Button type="button" size="sm" variant={dirty ? "default" : "outline"} disabled={!dirty || pending} onClick={save}>
            {pending ? t("saving") : t("save")}
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
