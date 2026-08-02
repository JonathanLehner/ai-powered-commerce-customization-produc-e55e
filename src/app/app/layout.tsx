import { requireUser } from "@/lib/session";

/**
 * Auth boundary for the agency workspace. The header is rendered per route so
 * the store switcher can highlight the store the route belongs to.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return <div className="flex min-h-full flex-col bg-canvas">{children}</div>;
}
