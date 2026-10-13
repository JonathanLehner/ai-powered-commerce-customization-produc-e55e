"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RANGE_KEYS, type RangeKey } from "@/lib/analytics";

/**
 * The range dropdown. A preset applies as soon as it is picked; "Custom" opens
 * two date fields and waits for Apply. It is a GET form, so the range lives in
 * the URL and works without JavaScript too.
 */
export function RangeControls({
  base,
  range,
  from,
  to,
  today,
}: {
  base: string;
  range: RangeKey;
  from: string;
  to: string;
  today: string;
}) {
  const t = useTranslations("analytics");
  const router = useRouter();
  const [key, setKey] = useState<RangeKey>(range);
  const [pending, startTransition] = useTransition();

  return (
    <form method="get" action={base} className="flex flex-wrap items-end gap-2">
      <Label htmlFor="range" className="sr-only">
        {t("rangeLabel")}
      </Label>
      <Select
        name="range"
        value={key}
        disabled={pending}
        onValueChange={(next) => {
          setKey(next as RangeKey);
          if (next !== "custom") startTransition(() => router.push(`${base}?range=${next}`));
        }}
      >
        <SelectTrigger id="range" className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RANGE_KEYS.map((option) => (
            <SelectItem key={option} value={option}>
              {t(`range.${option}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {key === "custom" ? (
        <>
          <div className="grid gap-1">
            <Label htmlFor="from" className="text-xs text-muted-foreground">
              {t("from")}
            </Label>
            <Input id="from" name="from" type="date" defaultValue={from} max={today} required className="w-40" />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="to" className="text-xs text-muted-foreground">
              {t("to")}
            </Label>
            <Input id="to" name="to" type="date" defaultValue={to} max={today} required className="w-40" />
          </div>
          <Button type="submit" variant="outline">
            {t("apply")}
          </Button>
        </>
      ) : (
        <noscript>
          <Button type="submit" variant="outline">
            {t("apply")}
          </Button>
        </noscript>
      )}
    </form>
  );
}
