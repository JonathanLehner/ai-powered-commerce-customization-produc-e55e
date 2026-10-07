"use client";

import { ChevronsUpDownIcon, LogOutIcon, ShieldCheckIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signOut } from "@/app/actions/auth";
import { Badge, Logo } from "@/components/ui";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import type { AccessibleStore } from "@/lib/session";
import { storeAccessLabel, type User } from "@/lib/types";

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");
}

function platformRoleLabel(role: User["platformRole"]): string {
  return role === "platform_admin"
    ? "Platform admin"
    : role === "agency_admin"
      ? "Agency admin"
      : "Agency member";
}

export function AppHeader({
  user,
  stores,
  currentStoreId,
}: {
  user: User;
  stores: AccessibleStore[];
  currentStoreId?: string;
}) {
  const router = useRouter();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const active = stores.filter((s) => s.store.status === "active");
  const current = stores.find((s) => s.store.id === currentStoreId);

  function go(href: string) {
    setSwitcherOpen(false);
    router.push(href);
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      <div className="mx-auto flex h-14 w-full max-w-[92rem] items-center gap-2 px-3 sm:gap-3 sm:px-6">
        <Link href="/app" className="shrink-0" aria-label="Parcelith agency workspace">
          <Logo size={24} />
        </Link>

        <Separator orientation="vertical" className="hidden h-5! sm:block" />

        <Popover open={switcherOpen} onOpenChange={setSwitcherOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-label="Switch store"
              className="min-w-0 flex-1 justify-between font-normal sm:w-56 sm:flex-none"
            >
              <span className="truncate">{current ? current.store.name : "All stores"}</span>
              <ChevronsUpDownIcon className="shrink-0 text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[min(18rem,calc(100vw-1.5rem))] p-0">
            <Command>
              <CommandInput placeholder="Switch store" />
              <CommandList>
                <CommandEmpty>No active stores yet.</CommandEmpty>
                <CommandGroup>
                  {active.map(({ store, role, viaPlatform }) => (
                    <CommandItem
                      key={store.id}
                      value={`${store.name} ${store.clientName}`}
                      data-checked={store.id === currentStoreId ? "true" : undefined}
                      onSelect={() => go(`/app/stores/${store.id}`)}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{store.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {store.clientName}
                        </span>
                      </span>
                      {store.id === currentStoreId ? null : (
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {storeAccessLabel(role, viaPlatform).split(" ")[0]}
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem value="All stores" onSelect={() => go("/app")}>
                    All stores
                  </CommandItem>
                  <CommandItem
                    value="Create a client store"
                    onSelect={() => go("/app/stores/new")}
                    className="text-primary"
                  >
                    + Create a client store
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          {user.platformRole === "platform_admin" ? (
            <Button asChild variant="ghost" className="hidden sm:inline-flex">
              <Link href="/admin">Platform admin</Link>
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 px-1.5" aria-label={user.name}>
                <Avatar size="sm">
                  <AvatarFallback className="bg-brand-50 text-[11px] font-semibold text-brand-700">
                    {initials(user.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden font-medium sm:block">{user.name}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 p-2">
              <div className="px-1.5 py-1">
                <p className="text-sm font-medium text-foreground">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                <p className="mt-2">
                  <Badge tone={user.platformRole === "platform_admin" ? "green" : "brand"}>
                    {platformRoleLabel(user.platformRole)}
                  </Badge>
                </p>
                <p className="mt-2 text-xs text-muted-foreground">{user.title}</p>
              </div>
              <DropdownMenuSeparator />
              {user.platformRole === "platform_admin" ? (
                <DropdownMenuItem asChild className="sm:hidden">
                  <Link href="/admin">
                    <ShieldCheckIcon />
                    Platform admin
                  </Link>
                </DropdownMenuItem>
              ) : null}
              {/* A POST to the server action, so signing out is not a GET a
                  prefetch or a crawler could fire. Selecting the item does not
                  close the menu, which would unmount the button mid-submit. */}
              <form action={signOut}>
                <DropdownMenuItem asChild onSelect={(event) => event.preventDefault()}>
                  <button type="submit" className="w-full">
                    <LogOutIcon />
                    Sign out
                  </button>
                </DropdownMenuItem>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
