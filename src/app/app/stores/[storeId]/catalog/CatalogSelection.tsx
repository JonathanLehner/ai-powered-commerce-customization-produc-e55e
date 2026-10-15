"use client";

import { ChevronDownIcon, XIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { createContext, useContext, useMemo, useState, useTransition, type ReactNode } from "react";
import { bulkUpdateProducts, type BulkProductAction, type BulkProductOutcome } from "@/app/actions/products";
import { Callout } from "@/components/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import {
  approveBlock,
  archiveBlock,
  bracketBlock,
  previewPrice,
  publishBlock,
  publishHoldups,
  unpublishBlock,
  visibilityBlock,
  type BulkProduct,
  type PriceChange,
  type PriceMode,
  type ProductBlock,
} from "@/lib/bulk-products";
import { marginTone } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { formatMoney, formatPercent, parseMoney } from "@/lib/util";

type Kind = BulkProductAction["kind"];

interface Selection {
  products: BulkProduct[];
  selected: BulkProduct[];
  isSelected: (id: string) => boolean;
  toggle: (id: string, on: boolean) => void;
  setAll: (on: boolean) => void;
  clear: () => void;
  /** Drops the products an action handled; the ones it skipped stay ticked to retry. */
  keepOnly: (ids: string[]) => void;
}

const SelectionContext = createContext<Selection | null>(null);

function useSelection() {
  const value = useContext(SelectionContext);
  if (!value) throw new Error("useSelection outside CatalogSelection");
  return value;
}

/**
 * The ticked products of the filtered catalog. The page keys this on its
 * filters, so changing them starts with nothing ticked.
 */
export function CatalogSelection({ products, children }: { products: BulkProduct[]; children: ReactNode }) {
  const [ids, setIds] = useState<Set<string>>(() => new Set());
  const value = useMemo<Selection>(() => {
    const selected = products.filter((product) => ids.has(product.id));
    return {
      products,
      selected,
      isSelected: (id) => ids.has(id),
      toggle: (id, on) =>
        setIds((current) => {
          const next = new Set(current);
          if (on) next.add(id);
          else next.delete(id);
          return next;
        }),
      setAll: (on) => setIds(on ? new Set(products.map((product) => product.id)) : new Set()),
      clear: () => setIds(new Set()),
      keepOnly: (keep) => setIds(new Set(keep)),
    };
  }, [products, ids]);
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

/** A grid item that shows when its product is ticked. */
export function SelectableItem({ id, className, children }: { id: string; className?: string; children: ReactNode }) {
  const { isSelected } = useSelection();
  return (
    <li className={cn("group", className)} data-state={isSelected(id) ? "selected" : undefined}>
      {children}
    </li>
  );
}

export function ProductCheckbox({ id, name }: { id: string; name: string }) {
  const { isSelected, toggle } = useSelection();
  const t = useTranslations("catalog.bulk");
  return (
    <span className="flex rounded-md bg-card p-1 shadow-sm ring-1 ring-foreground/10">
      <Checkbox
        aria-label={t("selectProduct", { name })}
        checked={isSelected(id)}
        onCheckedChange={(on) => toggle(id, on === true)}
      />
    </span>
  );
}

interface Report {
  kind: Kind;
  outcome: BulkProductOutcome;
}

function useBlockLabel() {
  const t = useTranslations("catalog.bulk");
  return (product: BulkProduct, block: ProductBlock) =>
    // "Not ready" names the actual reasons, the same ones the product page lists.
    block === "notReady" ? product.publishBlockers.join(" ") : t(`blocked.${block}`);
}

function SkipList({ entries }: { entries: { id: string; name: string; reason: string }[] }) {
  return (
    <ul className="mt-1 list-disc space-y-0.5 pl-5">
      {entries.map((entry) => (
        <li key={entry.id}>
          <span className="font-medium">{entry.name}</span>: {entry.reason}
        </li>
      ))}
    </ul>
  );
}

/**
 * Select-all, the bar of actions shown while products are ticked, and the
 * report of the last action: how many products it changed and why the rest
 * were skipped.
 */
export function BulkActionBar({
  storeId,
  brackets,
  pricesIncludeTax,
}: {
  storeId: string;
  brackets: { id: string; name: string; rate: number }[];
  pricesIncludeTax: boolean;
}) {
  const { products, selected, setAll, clear, keepOnly } = useSelection();
  const t = useTranslations("catalog.bulk");
  const blockLabel = useBlockLabel();
  const [pending, startTransition] = useTransition();
  const [report, setReport] = useState<Report | null>(null);
  const [dialog, setDialog] = useState<"approve" | "publish" | "unpublish" | "archive" | "price" | null>(null);

  const all = selected.length > 0 && selected.length === products.length;
  const ids = selected.map((product) => product.id);

  function run(action: BulkProductAction, onDone?: () => void) {
    // The transition locks every control at once, so a second click cannot
    // send the same action again.
    if (pending) return;
    startTransition(async () => {
      let outcome: BulkProductOutcome;
      try {
        outcome = await bulkUpdateProducts(storeId, ids, action);
      } catch {
        outcome = { error: t("failedGeneric"), succeeded: [], failed: [] };
      }
      if (outcome.error) {
        toast.error(outcome.error);
        return;
      }
      setReport({ kind: action.kind, outcome });
      // Approved products stay ticked, ready to publish next.
      if (action.kind !== "approve") keepOnly(outcome.failed.map((entry) => entry.id));
      if (outcome.succeeded.length > 0) toast.success(t(`result.${action.kind}`, { count: outcome.succeeded.length }));
      onDone?.();
    });
  }

  const statusChecks = {
    approve: approveBlock,
    publish: publishBlock,
    unpublish: unpublishBlock,
    archive: archiveBlock,
  } as const;
  const confirming = dialog === "price" ? null : dialog;
  const skipped = confirming
    ? selected.flatMap((product) => {
        const block = statusChecks[confirming](product);
        return block ? [{ id: product.id, name: product.name, reason: blockLabel(product, block) }] : [];
      })
    : [];
  const eligibleFor = (check: (product: BulkProduct) => ProductBlock | null) =>
    selected.filter((product) => !check(product)).length;
  const publishable = eligibleFor(publishBlock);
  // A greyed-out Publish says what holds the selection back.
  const holdups =
    publishable === 0
      ? publishHoldups(selected)
          .slice(0, 2)
          .map(({ code, count }) => t(`holdup.${code}`, { count }))
          .join(", ")
      : "";

  return (
    <>
      {report ? (
        <Callout tone={report.outcome.failed.length > 0 ? "amber" : "green"}>
          <div className="flex items-start justify-between gap-3">
            <div role="status" aria-live="polite">
              <p className="font-medium">{t(`result.${report.kind}`, { count: report.outcome.succeeded.length })}</p>
              {report.outcome.failed.length > 0 ? (
                <>
                  <p className="mt-1">{t("result.failed", { count: report.outcome.failed.length })}</p>
                  <SkipList entries={report.outcome.failed} />
                </>
              ) : null}
            </div>
            <Button variant="ghost" size="icon-sm" onClick={() => setReport(null)}>
              <XIcon />
              <span className="sr-only">{t("dismiss")}</span>
            </Button>
          </div>
        </Callout>
      ) : null}

      <div
        role="toolbar"
        aria-label={t("toolbar")}
        className="flex min-h-11 flex-wrap items-center gap-2 rounded-xl bg-card px-3 py-2 ring-1 ring-foreground/10"
      >
        <Label className="gap-2 text-sm font-medium text-foreground">
          <Checkbox
            checked={all ? true : selected.length > 0 ? "indeterminate" : false}
            onCheckedChange={() => setAll(!all)}
          />
          {selected.length > 0 ? t("selected", { count: selected.length }) : t("selectAll")}
        </Label>
        {selected.length > 0 ? (
          <>
            <Button variant="ghost" size="sm" onClick={clear} disabled={pending}>
              {t("clear")}
            </Button>
            <span className="flex flex-wrap items-center gap-2 sm:ml-auto">
              {holdups ? (
                <span id="bulk-publish-holdups" className="text-xs text-muted-foreground">
                  {holdups}
                </span>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                disabled={pending || eligibleFor(approveBlock) === 0}
                onClick={() => setDialog("approve")}
              >
                {t("approve")}
              </Button>
              <Button
                size="sm"
                disabled={pending || publishable === 0}
                aria-describedby={holdups ? "bulk-publish-holdups" : undefined}
                onClick={() => setDialog("publish")}
              >
                {t("publish")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pending || eligibleFor(unpublishBlock) === 0}
                onClick={() => setDialog("unpublish")}
              >
                {t("unpublish")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pending || eligibleFor(archiveBlock) === 0}
                onClick={() => setDialog("archive")}
              >
                {t("archive")}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" disabled={pending || brackets.length === 0}>
                    {t("taxBracket")}
                    <ChevronDownIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {brackets.map((bracket) => {
                    const count = eligibleFor((product) => bracketBlock(product, bracket.id));
                    return (
                      <DropdownMenuItem
                        key={bracket.id}
                        disabled={count === 0}
                        onSelect={() => run({ kind: "bracket", bracketId: bracket.id })}
                      >
                        {bracket.name} ({formatPercent(bracket.rate)})
                        <span className="ml-auto pl-4 text-xs text-muted-foreground tabular-nums">
                          {t("eligible", { count, total: selected.length })}
                        </span>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" disabled={pending}>
                    {t("visibility")}
                    <ChevronDownIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {(["public", "hidden"] as const).map((visibility) => {
                    const count = eligibleFor((product) => visibilityBlock(product, visibility));
                    return (
                      <DropdownMenuItem
                        key={visibility}
                        disabled={count === 0}
                        onSelect={() => run({ kind: "visibility", visibility })}
                      >
                        {visibility === "public" ? t("visible") : t("hidden")}
                        <span className="ml-auto pl-4 text-xs text-muted-foreground tabular-nums">
                          {t("eligible", { count, total: selected.length })}
                        </span>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="outline" size="sm" disabled={pending} onClick={() => setDialog("price")}>
                {t("changePrice")}
              </Button>
            </span>
          </>
        ) : null}
      </div>

      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <AlertDialogContent>
          {confirming ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t(`confirm.${confirming}Title`, { count: selected.length - skipped.length })}
                </AlertDialogTitle>
                <AlertDialogDescription>{t(`confirm.${confirming}Body`)}</AlertDialogDescription>
              </AlertDialogHeader>
              {skipped.length > 0 ? (
                <div className="max-h-[40vh] overflow-y-auto text-sm text-muted-foreground">
                  <p>{t("skipHeading", { count: skipped.length })}</p>
                  <SkipList entries={skipped} />
                </div>
              ) : null}
              <AlertDialogFooter>
                <AlertDialogCancel />
                <AlertDialogAction
                  variant={confirming === "publish" || confirming === "approve" ? "default" : "destructive"}
                  disabled={pending || skipped.length === selected.length}
                  onClick={() => run({ kind: confirming })}
                >
                  {t(confirming)}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : null}
        </AlertDialogContent>
      </AlertDialog>

      <PriceDialog
        open={dialog === "price"}
        onOpenChange={(open) => setDialog(open ? "price" : null)}
        products={selected}
        pricesIncludeTax={pricesIncludeTax}
        pending={pending}
        onSubmit={(change) =>
          run(
            {
              kind: "price",
              change,
              from: Object.fromEntries(selected.map((product) => [product.id, product.price])),
            },
            () => setDialog(null),
          )
        }
      />
    </>
  );
}

function marginClass(pct: number) {
  const tone = marginTone(pct);
  return tone === "healthy" ? "text-emerald-700" : tone === "thin" ? "text-amber-700" : "text-rose-700";
}

/** Raise, lower or set the price, with the margins each product would be left with. */
function PriceDialog({
  open,
  onOpenChange,
  products,
  pricesIncludeTax,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: BulkProduct[];
  pricesIncludeTax: boolean;
  pending: boolean;
  onSubmit: (change: PriceChange) => void;
}) {
  const t = useTranslations("catalog.bulk");
  const blockLabel = useBlockLabel();
  const locale = useLocale();
  const [mode, setMode] = useState<PriceMode>("increase");
  const [raw, setRaw] = useState("");

  // A new price is entered in the store's currency, which every product is
  // imported in.
  const currency = products[0]?.currency ?? "USD";
  const change = ((): PriceChange | null => {
    if (mode === "set") {
      const value = parseMoney(raw, currency);
      return value && value > 0 ? { mode, value } : null;
    }
    const value = Number(raw.replace(",", "."));
    if (!raw.trim() || !Number.isFinite(value) || value <= 0 || value > 1000) return null;
    if (mode === "decrease" && value >= 100) return null;
    return { mode, value };
  })();
  const rows = change
    ? products.map((product) => ({ product, preview: previewPrice(product, change, pricesIncludeTax) }))
    : [];
  const applicable = rows.filter((row) => !row.preview.block).length;
  const invalid = raw.trim() !== "" && !change;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("price.title")}</DialogTitle>
          <DialogDescription>{t("price.body")}</DialogDescription>
        </DialogHeader>
        <form
          id="bulk-price"
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (pending || !change || applicable === 0) return;
            onSubmit(change);
          }}
        >
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bulk-price-mode">{t("price.mode")}</Label>
              <Select value={mode} onValueChange={(value) => setMode(value as PriceMode)}>
                <SelectTrigger id="bulk-price-mode" className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="increase">{t("price.increase")}</SelectItem>
                  <SelectItem value="decrease">{t("price.decrease")}</SelectItem>
                  <SelectItem value="set">{t("price.set")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bulk-price-value">
                {mode === "set" ? `${t("price.value")} (${currency})` : `${t("price.value")} (%)`}
              </Label>
              <Input
                id="bulk-price-value"
                inputMode="decimal"
                autoComplete="off"
                value={raw}
                onChange={(event) => setRaw(event.target.value)}
                placeholder={mode === "set" ? "0.00" : t("price.percentPlaceholder")}
                aria-invalid={invalid ? true : undefined}
                className="w-32 tabular-nums"
              />
            </div>
          </div>
          {invalid ? <p className="text-xs text-destructive">{t("price.invalid")}</p> : null}

          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("price.enterAmount")}</p>
          ) : (
            <div className="max-h-[45vh] overflow-auto rounded-lg ring-1 ring-foreground/10">
              <table className="w-full min-w-[34rem] text-sm">
                <thead className="sticky top-0 bg-muted text-left text-xs font-semibold tracking-wide uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">{t("price.colProduct")}</th>
                    <th className="px-3 py-2 text-right">{t("price.colPrice")}</th>
                    <th className="px-3 py-2 text-right">{t("price.colNewPrice")}</th>
                    <th className="px-3 py-2 text-right">{t("price.colMargin")}</th>
                    <th className="px-3 py-2 text-right">{t("price.colNewMargin")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map(({ product, preview }) => (
                    <tr key={product.id} className={preview.block ? "bg-rose-50/60" : undefined}>
                      <td className="px-3 py-2">
                        <span className="font-medium text-foreground">{product.name}</span>
                        {preview.block ? (
                          <span className="block text-xs text-rose-700">
                            {t("price.skipped")}: {blockLabel(product, preview.block)}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {formatMoney(product.price, product.currency, locale)}
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums text-foreground">
                        {formatMoney(preview.price, product.currency, locale)}
                      </td>
                      <td className={cn("px-3 py-2 text-right tabular-nums", marginClass(product.costs.marginPct))}>
                        {formatPercent(product.costs.marginPct)}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right font-semibold tabular-nums",
                          marginClass(preview.marginPct),
                        )}
                      >
                        {formatPercent(preview.marginPct)}
                        <span className="block text-xs font-normal text-muted-foreground">
                          {formatMoney(preview.marginAmount, product.currency, locale)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </form>
        <DialogFooter>
          <Button type="submit" form="bulk-price" disabled={pending || !change || applicable === 0}>
            {pending ? t("working") : t("price.submit", { count: applicable })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
