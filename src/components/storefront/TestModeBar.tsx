/** Across the top of a storefront or gift portal while the store is in test mode. */
export function TestModeBar({ label }: { label: string }) {
  return (
    <div role="status" className="bg-amber-400 px-4 py-1.5 text-center text-xs font-semibold tracking-wide text-amber-950">
      {label}
    </div>
  );
}
