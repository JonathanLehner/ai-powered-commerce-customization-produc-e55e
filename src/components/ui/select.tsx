import { cn } from "@/lib/cn";

/**
 * The native select, styled to match `Input`. A storefront's currency and
 * language controls submit inside plain server-action forms and are read back by
 * the acceptance replay as `select` elements, so this stays a real `<select>`
 * rather than a listbox that needs JavaScript to produce a value.
 */
export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "h-10 w-full appearance-none rounded-lg border border-input bg-background bg-[length:1rem] bg-[right_0.6rem_center] bg-no-repeat px-3 py-2 pr-9 text-sm text-foreground outline-none transition-colors",
        "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 aria-invalid:border-rose-400",
        "bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%236b7789%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22/%3E%3C/svg%3E')]",
        className,
      )}
      {...props}
    />
  );
}
