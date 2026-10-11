"use client";

import { useLocale } from "next-intl";
import { useSyncExternalStore } from "react";
import { defaultPlanCurrency, isPlanCurrency, type PlanCurrency } from "@/lib/plans";

const STORAGE_KEY = "parcelith.planCurrency";
const CHANGE_EVENT = "parcelith:plan-currency";

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function storedCurrency(): PlanCurrency | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return isPlanCurrency(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * The currency plans are shown and billed in. The pages are prerendered, so the
 * HTML carries the language's default; a currency the visitor picked on the
 * pricing or contact page is remembered in the browser and applies on both.
 */
export function usePlanCurrency(): [PlanCurrency, (currency: PlanCurrency) => void] {
  const fallback = defaultPlanCurrency(useLocale());
  const stored = useSyncExternalStore(subscribe, storedCurrency, () => null);
  const choose = (currency: PlanCurrency) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, currency);
    } catch {
      // Storage is blocked: the language's default stays.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };
  return [stored ?? fallback, choose];
}
