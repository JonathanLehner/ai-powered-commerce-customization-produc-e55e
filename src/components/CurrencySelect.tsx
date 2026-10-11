"use client";

import { useState, useTransition } from "react";
import { setCurrency } from "@/app/actions/shop";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * The storefront header's display-currency picker.
 *
 * A native `<select>` would submit on its own, but its dropdown is drawn by the
 * operating system, so it is the one control on a storefront that cannot carry
 * the client's brand — and it is in the header of every page. The choice is
 * applied as soon as it is made: the enclosing form's fields are posted to the
 * same `setCurrency` action with the picked code. Radix's own hidden select is
 * not relied on for this, because it carries no options until the list has
 * been opened, so a currency picked by typing on the closed trigger would be
 * lost. The picker is locked while the change is applied, so it cannot race
 * itself.
 *
 * Without JavaScript this control cannot open; the layout renders a native
 * select and submit button inside `<noscript>` for that case.
 */
export function CurrencySelect({
  id,
  defaultValue,
  currencies,
}: {
  id: string;
  defaultValue: string;
  currencies: string[];
}) {
  const [value, setValue] = useState(defaultValue);
  const [pending, startTransition] = useTransition();

  function apply(next: string, form: HTMLFormElement | null) {
    setValue(next);
    if (!form || next === defaultValue) return;
    const formData = new FormData(form);
    formData.set("currency", next);
    startTransition(() => setCurrency(formData));
  }

  return (
    <Select
      value={value}
      disabled={pending}
      onValueChange={(next) => apply(next, document.getElementById(id)?.closest("form") ?? null)}
    >
      {/* h-9 rather than a Select size, so the trigger lines up with the
          size="lg" buttons it shares the header row with. */}
      <SelectTrigger id={id} className="h-9 w-[5.5rem]" aria-busy={pending}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {currencies.map((code) => (
          <SelectItem key={code} value={code}>
            {code}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
