"use client";

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
 * the client's brand — and it is in the header of every page. Radix's Select
 * renders a hidden native select for the enclosing `<form>`, so the server
 * action still receives `currency` exactly as before while the list itself is
 * drawn with the store's own colours and type.
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
  return (
    <Select name="currency" defaultValue={defaultValue}>
      {/* h-9 rather than a Select size, so the trigger lines up with the
          size="lg" buttons it shares the header row with. */}
      <SelectTrigger id={id} className="h-9 w-[5.5rem]">
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
