import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * The class-name helper the shadcn/ui primitives in `components/ui` are written
 * against: unlike `classNames`, it resolves conflicts, so a `className` passed
 * into a primitive wins over the variant's own utility rather than landing next
 * to it and losing on source order.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
