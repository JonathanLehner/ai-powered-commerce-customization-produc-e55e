"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { countryName, matchCountry, searchCountries } from "@/lib/countries";
import { classNames } from "@/lib/util";

/**
 * Type-ahead country picker. The shopper searches full country names; the form
 * submits the ISO alpha-2 code the rest of the platform routes on, so nobody
 * has to know that South Africa is ZA.
 */
export function CountrySelect({
  id,
  name,
  value,
  onChange,
  invalid,
  describedBy,
}: {
  id: string;
  name: string;
  value: string;
  onChange: (code: string) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  const listId = useId();
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [moved, setMoved] = useState<number | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const matches = useMemo(() => searchCountries(query ?? ""), [query]);
  const display = query ?? countryName(value);

  // Until the shopper arrows or types, the highlighted row is the country they
  // already have, so opening the list and pressing Enter keeps their choice
  // instead of picking whatever sorts first.
  const selectedIndex = matches.findIndex((c) => c.code === value);
  const active = moved ?? (query === null && selectedIndex >= 0 ? selectedIndex : 0);

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    if (!open) return;
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function reset() {
    setQuery(null);
    setOpen(false);
    setMoved(null);
  }

  function choose(code: string) {
    onChange(code);
    reset();
  }

  /** Leaving the field commits an exact name or code — the shape autofill leaves behind. */
  function commit() {
    if (query !== null) {
      const exact = matchCountry(query) ?? (matches.length === 1 ? matches[0] : null);
      if (exact) onChange(exact.code);
    }
    reset();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (matches.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setMoved((active + step + matches.length) % matches.length);
      return;
    }
    if (event.key === "Enter") {
      // Picking from the list must never submit the checkout form.
      if (open && matches[active]) {
        event.preventDefault();
        choose(matches[active].code);
      }
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      reset();
    }
  }

  return (
    <div className="relative">
      <input type="hidden" name={name} value={value} />
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? `${listId}-${matches[active].code}` : undefined}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        autoComplete="country-name"
        spellCheck={false}
        placeholder="Search countries"
        value={display}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setMoved(null);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        className={classNames("input pr-9", invalid && "input-error")}
      />
      <span aria-hidden className="pointer-events-none absolute top-1/2 right-3 mt-0.5 -translate-y-1/2 text-muted">
        ▾
      </span>

      {open ? (
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          aria-label="Country"
          className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-line bg-white py-1 shadow-lg"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">No country matches “{query}”.</li>
          ) : (
            matches.map((country, index) => (
              <li
                key={country.code}
                id={`${listId}-${country.code}`}
                role="option"
                aria-selected={country.code === value}
                // Mouse down would blur the input and close the list before the click lands.
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(country.code);
                }}
                onMouseEnter={() => setMoved(index)}
                className={classNames(
                  "flex cursor-pointer items-center justify-between gap-3 px-3 py-1.5 text-sm",
                  index === active ? "bg-brand-50 text-brand-700" : "text-ink",
                )}
              >
                <span>{country.name}</span>
                <span className="font-mono text-xs text-muted">{country.code}</span>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
