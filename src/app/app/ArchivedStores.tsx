"use client";

import { ChevronDownIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { setStoreStatus } from "@/app/actions/stores";
import { Button } from "@/components/ui/button";

/**
 * The archived list, folded away behind a toggle that says how many there are.
 * An agency that has run for a while has more archived stores than live ones,
 * and the dashboard is read for the live ones.
 *
 * The rows are drawn here from plain records rather than handed over as
 * rendered markup: dozens of folded rows of button markup made up a third of
 * the dashboard's weight.
 */
export function ArchivedStores({ stores }: { stores: { id: string; name: string; detail: string }[] }) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("dashboard");
  const count = stores.length;
  return (
    <div className="mt-4 space-y-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <ChevronDownIcon className={open ? "rotate-180 transition-transform" : "transition-transform"} />
        {open ? t("hideArchived", { count }) : t("showArchived", { count })}
      </Button>
      {open ? (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {stores.map((store) => (
            <li key={store.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{store.name}</p>
                <p className="truncate text-xs text-muted-foreground">{store.detail}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild size="sm" variant="ghost">
                  <Link href={`/app/stores/${store.id}`}>{t("viewRecords")}</Link>
                </Button>
                <form action={setStoreStatus}>
                  <input type="hidden" name="storeId" value={store.id} />
                  <input type="hidden" name="status" value="active" />
                  <Button type="submit" size="sm" variant="outline">
                    {t("restore")}
                  </Button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
