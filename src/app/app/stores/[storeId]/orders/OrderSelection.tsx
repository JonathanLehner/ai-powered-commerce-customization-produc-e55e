"use client";

import { ChevronDownIcon, DownloadIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { createContext, useContext, useMemo, useState, useTransition, type ReactNode } from "react";
import {
  bulkAdvanceOrders,
  bulkRouteOrders,
  bulkShipOrders,
  type BulkOutcome,
} from "@/app/actions/orders";
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
import { TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/sonner";
import {
  BULK_STATUSES,
  moveBlock,
  routeBlock,
  shipBlock,
  type BulkBlock,
  type BulkOrder,
  type BulkStatus,
} from "@/lib/bulk-orders";
import { CARRIER_LABELS } from "@/lib/util";

type Action = "shipped" | "routed" | BulkStatus;
type Carrier = NonNullable<BulkOrder["fulfillment"]["carrier"]>;

interface Selection {
  orders: BulkOrder[];
  selected: BulkOrder[];
  isSelected: (id: string) => boolean;
  toggle: (id: string, on: boolean) => void;
  setAll: (on: boolean) => void;
  clear: () => void;
  /** Drops the orders an action handled; the ones it could not stay ticked to retry. */
  keepOnly: (ids: string[]) => void;
}

const SelectionContext = createContext<Selection | null>(null);

function useSelection() {
  const value = useContext(SelectionContext);
  if (!value) throw new Error("useSelection outside OrderSelection");
  return value;
}

/**
 * The ticked rows of one page of the queue. The page keys this on its query
 * string, so moving to another page or filter starts with nothing ticked, and
 * a row that leaves the page after an action leaves the selection with it.
 */
export function OrderSelection({ orders, children }: { orders: BulkOrder[]; children: ReactNode }) {
  const [ids, setIds] = useState<Set<string>>(() => new Set());
  const value = useMemo<Selection>(() => {
    const selected = orders.filter((order) => ids.has(order.id));
    return {
      orders,
      selected,
      isSelected: (id) => ids.has(id),
      toggle: (id, on) =>
        setIds((current) => {
          const next = new Set(current);
          if (on) next.add(id);
          else next.delete(id);
          return next;
        }),
      setAll: (on) => setIds(on ? new Set(orders.map((order) => order.id)) : new Set()),
      clear: () => setIds(new Set()),
      keepOnly: (keep) => setIds(new Set(keep)),
    };
  }, [orders, ids]);
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function SelectAllCheckbox() {
  const { orders, selected, setAll } = useSelection();
  const t = useTranslations("orders.bulk");
  const all = selected.length > 0 && selected.length === orders.length;
  return (
    <Checkbox
      aria-label={t("selectAll")}
      checked={all ? true : selected.length > 0 ? "indeterminate" : false}
      onCheckedChange={() => setAll(!all)}
    />
  );
}

/** A table row that shows when it is ticked. */
export function SelectableRow({ id, className, children }: { id: string; className?: string; children: ReactNode }) {
  const { isSelected } = useSelection();
  return (
    <TableRow className={className} data-state={isSelected(id) ? "selected" : undefined}>
      {children}
    </TableRow>
  );
}

export function RowCheckbox({ id, code }: { id: string; code: string }) {
  const { isSelected, toggle } = useSelection();
  const t = useTranslations("orders.bulk");
  return (
    // Above the order link stretched across the row, so ticking a box does
    // not open the order.
    <span className="relative z-[1] flex">
      <Checkbox
        aria-label={t("selectOrder", { code })}
        checked={isSelected(id)}
        onCheckedChange={(on) => toggle(id, on === true)}
      />
    </span>
  );
}

function useBlockedLabel() {
  const t = useTranslations("orders.bulk");
  const labels = useTranslations("labels");
  return (order: BulkOrder, reason: BulkBlock) =>
    t(`blocked.${reason}`, { status: labels(`orderStatus.${order.status}`) });
}

interface Report {
  action: Action;
  outcome: BulkOutcome;
}

/**
 * The bar shown over the table while rows are ticked, and the report of the
 * last bulk action: how many orders it handled and why the rest were not.
 */
export function BulkActionBar({
  storeId,
  exportBase,
  carriers,
}: {
  storeId: string;
  /** The CSV download, which reads the ticked orders off its `ids` parameter. */
  exportBase: string;
  carriers: Carrier[];
}) {
  const { selected, clear, keepOnly } = useSelection();
  const t = useTranslations("orders.bulk");
  const orders = useTranslations("orders");
  const labels = useTranslations("labels");
  const [pending, startTransition] = useTransition();
  const [report, setReport] = useState<Report | null>(null);
  const [dialog, setDialog] = useState<"ship" | "route" | null>(null);
  const [shipErrors, setShipErrors] = useState<Record<string, string>>({});

  const shippable = selected.filter((order) => !shipBlock(order));
  const routable = selected.filter((order) => !routeBlock(order));

  function run(action: Action, call: () => Promise<BulkOutcome>, onDone?: (outcome: BulkOutcome) => void) {
    startTransition(async () => {
      let outcome: BulkOutcome;
      try {
        outcome = await call();
      } catch {
        outcome = { error: t("failedGeneric"), succeeded: [], failed: [] };
      }
      if (outcome.error) {
        toast.error(outcome.error);
        return;
      }
      setReport({ action, outcome });
      keepOnly(outcome.failed.map((entry) => entry.id));
      if (outcome.succeeded.length > 0) toast.success(summary({ action, outcome }));
      onDone?.(outcome);
    });
  }

  function summary({ action, outcome }: Report) {
    const count = outcome.succeeded.length;
    if (action === "shipped") return t("result.shipped", { count });
    if (action === "routed") return t("result.routed", { count });
    return t("result.advanced", { count, status: labels(`orderStatus.${action}`) });
  }

  const ids = selected.map((order) => order.id);

  return (
    <>
      {report ? (
        <Callout tone={report.outcome.failed.length > 0 ? "amber" : "green"}>
          <div className="flex items-start justify-between gap-3">
            <div role="status" aria-live="polite">
              <p className="font-medium">{summary(report)}</p>
              {report.outcome.failed.length > 0 ? (
                <>
                  <p className="mt-1">{t("result.failed", { count: report.outcome.failed.length })}</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">
                    {report.outcome.failed.map((entry) => (
                      <li key={entry.id}>
                        <span className="font-medium">{entry.code}</span>: {entry.reason}
                      </li>
                    ))}
                  </ul>
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

      {selected.length > 0 ? (
        <div
          role="toolbar"
          aria-label={t("toolbar")}
          className="flex flex-wrap items-center gap-2 rounded-xl bg-card px-3 py-2 ring-1 ring-foreground/10"
        >
          <span className="text-sm font-medium text-foreground">{t("selected", { count: selected.length })}</span>
          <Button variant="ghost" size="sm" onClick={clear} disabled={pending}>
            {orders("clear")}
          </Button>
          <span className="flex flex-wrap items-center gap-2 sm:ml-auto">
            <Button
              size="sm"
              disabled={pending || shippable.length === 0}
              onClick={() => {
                setShipErrors({});
                setDialog("ship");
              }}
            >
              {t("markShipped")}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={pending}>
                  {t("advance")}
                  <ChevronDownIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {BULK_STATUSES.map((status) => {
                  const count = selected.filter((order) => !moveBlock(order, status)).length;
                  return (
                    <DropdownMenuItem
                      key={status}
                      disabled={count === 0}
                      onSelect={() => run(status, () => bulkAdvanceOrders(storeId, ids, status))}
                    >
                      {labels(`orderStatus.${status}`)}
                      <span className="ml-auto pl-4 text-xs text-muted-foreground tabular-nums">
                        {t("eligible", { count, total: selected.length })}
                      </span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              size="sm"
              disabled={pending || routable.length === 0}
              onClick={() => setDialog("route")}
            >
              {t("route")}
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={`${exportBase}?ids=${ids.join(",")}`} download>
                <DownloadIcon />
                {orders("downloadCsv")}
              </a>
            </Button>
          </span>
        </div>
      ) : null}

      <ShipDialog
        open={dialog === "ship"}
        onOpenChange={(open) => setDialog(open ? "ship" : null)}
        orders={selected}
        carriers={carriers}
        errors={shipErrors}
        pending={pending}
        onSubmit={(shipments) =>
          run("shipped", () => bulkShipOrders(storeId, shipments), (outcome) => {
            // Rows that went through drop out of the dialog; the rest stay
            // open with their reason, and with what was typed into them.
            const retry = outcome.failed.filter((entry) => shippable.some((order) => order.id === entry.id));
            setShipErrors(Object.fromEntries(retry.map((entry) => [entry.id, entry.reason])));
            if (retry.length === 0) setDialog(null);
          })
        }
      />

      <AlertDialog open={dialog === "route"} onOpenChange={(open) => setDialog(open ? "route" : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("routeTitle", { count: routable.length })}</AlertDialogTitle>
            <AlertDialogDescription>
              {routable.length < selected.length
                ? t("routeSkipped", { count: selected.length - routable.length })
                : t("routeBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction
              disabled={pending}
              onClick={() => run("routed", () => bulkRouteOrders(storeId, ids))}
            >
              {t("route")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ShipDialog({
  open,
  onOpenChange,
  orders,
  carriers,
  errors,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orders: BulkOrder[];
  carriers: Carrier[];
  errors: Record<string, string>;
  pending: boolean;
  onSubmit: (shipments: { orderId: string; carrier: string; trackingNumber: string }[]) => void;
}) {
  const t = useTranslations("orders.bulk");
  const detail = useTranslations("orderDetail");
  const blockedLabel = useBlockedLabel();
  // Keyed by order, so a row that failed keeps what was typed into it.
  const [entries, setEntries] = useState<Record<string, { carrier: string; trackingNumber: string }>>({});

  const fallback = carriers[0] ?? "";
  const entryFor = (order: BulkOrder) =>
    entries[order.id] ?? {
      carrier: order.fulfillment.carrier && carriers.includes(order.fulfillment.carrier) ? order.fulfillment.carrier : fallback,
      trackingNumber: order.fulfillment.trackingNumber ?? "",
    };
  const update = (order: BulkOrder, patch: Partial<{ carrier: string; trackingNumber: string }>) =>
    setEntries((current) => ({ ...current, [order.id]: { ...entryFor(order), ...patch } }));

  const shippable = orders.filter((order) => !shipBlock(order));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("shipTitle", { count: shippable.length })}</DialogTitle>
          <DialogDescription>{t("shipBody")}</DialogDescription>
        </DialogHeader>
        <form
          id="bulk-ship"
          onSubmit={(event) => {
            event.preventDefault();
            if (pending) return;
            // Every ticked order is sent, so the ones that cannot ship are
            // reported with the rest rather than silently left out.
            onSubmit(
              orders.map((order) => {
                const entry = entryFor(order);
                return { orderId: order.id, carrier: entry.carrier, trackingNumber: entry.trackingNumber.trim() };
              }),
            );
          }}
          className="space-y-3"
        >
          {carriers.length === 0 ? (
            <p className="text-sm text-destructive">{detail("noCarriers")}</p>
          ) : shippable.length > 1 ? (
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="bulk-carrier" className="text-xs text-muted-foreground">
                {t("carrierForAll")}
              </Label>
              <Select
                onValueChange={(carrier) =>
                  setEntries((current) => {
                    const next = { ...current };
                    for (const order of shippable) next[order.id] = { ...entryFor(order), carrier };
                    return next;
                  })
                }
              >
                <SelectTrigger id="bulk-carrier" size="sm" className="w-40">
                  <SelectValue placeholder={t("chooseCarrier")} />
                </SelectTrigger>
                <SelectContent>
                  {carriers.map((carrier) => (
                    <SelectItem key={carrier} value={carrier}>
                      {CARRIER_LABELS[carrier]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <ul className="max-h-[50vh] divide-y divide-border overflow-y-auto rounded-lg ring-1 ring-foreground/10">
            {orders.map((order) => {
              const block = shipBlock(order);
              const entry = entryFor(order);
              const error = errors[order.id];
              return (
                <li key={order.id} className="grid gap-2 px-3 py-2.5 sm:grid-cols-[7rem_10rem_1fr] sm:items-center">
                  <span className="font-medium text-foreground">{order.code}</span>
                  {block ? (
                    <span className="text-xs text-muted-foreground sm:col-span-2">{blockedLabel(order, block)}</span>
                  ) : (
                    <>
                      <Select
                        value={entry.carrier || undefined}
                        onValueChange={(carrier) => update(order, { carrier })}
                        disabled={carriers.length === 0}
                      >
                        <SelectTrigger
                          className="w-full"
                          aria-label={t("carrierFor", { code: order.code })}
                        >
                          <SelectValue placeholder={t("chooseCarrier")} />
                        </SelectTrigger>
                        <SelectContent>
                          {carriers.map((carrier) => (
                            <SelectItem key={carrier} value={carrier}>
                              {CARRIER_LABELS[carrier]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        aria-label={t("trackingFor", { code: order.code })}
                        aria-invalid={error ? true : undefined}
                        value={entry.trackingNumber}
                        onChange={(event) => update(order, { trackingNumber: event.target.value })}
                        placeholder={detail("trackingPlaceholder")}
                      />
                      {error ? <p className="text-xs text-destructive sm:col-span-3">{error}</p> : null}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </form>
        <DialogFooter>
          <Button
            type="submit"
            form="bulk-ship"
            disabled={pending || shippable.length === 0 || carriers.length === 0}
          >
            {pending ? t("working") : t("shipSubmit", { count: shippable.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
