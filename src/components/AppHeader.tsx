import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { Badge, Logo } from "@/components/ui";
import type { AccessibleStore } from "@/lib/session";
import { storeAccessLabel, type User } from "@/lib/types";

export function AppHeader({
  user,
  stores,
  currentStoreId,
}: {
  user: User;
  stores: AccessibleStore[];
  currentStoreId?: string;
}) {
  const active = stores.filter((s) => s.store.status === "active");
  const current = stores.find((s) => s.store.id === currentStoreId);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white">
      <div className="mx-auto flex h-14 w-full max-w-[92rem] items-center gap-3 px-3 sm:gap-4 sm:px-6">
        <Link href="/app" className="shrink-0" aria-label="Parcelith agency workspace">
          <Logo size={26} />
        </Link>

        <span aria-hidden className="hidden h-6 w-px bg-line sm:block" />

        <details className="relative min-w-0 flex-1 sm:flex-none">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-sm hover:bg-canvas [&::-webkit-details-marker]:hidden">
            <span className="truncate font-medium text-ink">
              {current ? current.store.name : "All stores"}
            </span>
            <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-muted" fill="currentColor">
              <path d="M5.5 8l4.5 4.5L14.5 8z" />
            </svg>
          </summary>
          <div className="fixed inset-x-3 top-[3.75rem] z-50 rounded-xl border border-line bg-white p-2 shadow-lg sm:absolute sm:inset-x-auto sm:left-0 sm:top-auto sm:mt-2 sm:w-72">
            <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              Switch store
            </p>
            <ul className="max-h-80 overflow-y-auto">
              {active.length === 0 ? (
                <li className="px-2 py-2 text-sm text-muted">No active stores yet.</li>
              ) : null}
              {active.map(({ store, role, viaPlatform }) => (
                <li key={store.id}>
                  <Link
                    href={`/app/stores/${store.id}`}
                    className={
                      store.id === currentStoreId
                        ? "flex items-center justify-between gap-2 rounded-lg bg-brand-50 px-2 py-2 text-sm font-medium text-brand-800"
                        : "flex items-center justify-between gap-2 rounded-lg px-2 py-2 text-sm text-ink hover:bg-canvas"
                    }
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{store.name}</span>
                      <span className="block truncate text-xs text-muted">{store.clientName}</span>
                    </span>
                    <span className="shrink-0 text-[11px] text-muted">
                      {storeAccessLabel(role, viaPlatform).split(" ")[0]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-1 border-t border-line pt-1">
              <Link href="/app" className="block rounded-lg px-2 py-2 text-sm text-inksoft hover:bg-canvas">
                All stores
              </Link>
              <Link
                href="/app/stores/new"
                className="block rounded-lg px-2 py-2 text-sm font-medium text-brand-700 hover:bg-canvas"
              >
                + Create a client store
              </Link>
            </div>
          </div>
        </details>

        <div className="ml-auto flex items-center gap-2">
          {user.platformRole === "platform_admin" ? (
            <Link href="/admin" className="hidden rounded-lg px-3 py-1.5 text-sm font-medium text-inksoft hover:bg-canvas sm:block">
              Platform admin
            </Link>
          ) : null}
          <details className="relative">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-canvas [&::-webkit-details-marker]:hidden">
              <span
                aria-hidden
                className="flex h-7 w-7 items-center justify-center rounded-full bg-iris-100 text-xs font-semibold text-iris-700"
              >
                {user.name
                  .split(" ")
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <span className="hidden text-sm font-medium text-ink sm:block">{user.name}</span>
            </summary>
            <div className="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-line bg-white p-3 shadow-lg">
              <p className="text-sm font-semibold text-ink">{user.name}</p>
              <p className="truncate text-xs text-muted">{user.email}</p>
              <p className="mt-2">
                <Badge tone={user.platformRole === "platform_admin" ? "green" : "brand"}>
                  {user.platformRole === "platform_admin"
                    ? "Platform admin"
                    : user.platformRole === "agency_admin"
                      ? "Agency admin"
                      : "Agency member"}
                </Badge>
              </p>
              <p className="mt-2 text-xs text-muted">{user.title}</p>
              {user.platformRole === "platform_admin" ? (
                <Link href="/admin" className="btn-secondary btn-sm mt-3 w-full sm:hidden">
                  Platform admin
                </Link>
              ) : null}
              <form action={signOut}>
                <button type="submit" className="btn-secondary btn-sm mt-3 w-full">
                  Sign out
                </button>
              </form>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
