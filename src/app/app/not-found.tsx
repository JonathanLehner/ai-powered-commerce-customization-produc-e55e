import { AppHeader } from "@/components/AppHeader";
import { WorkspaceNotFoundView } from "@/components/NotFoundViews";
import { accessibleStores, requireUser } from "@/lib/session";

/**
 * The workspace's not-found boundary. Routes render their own not-found body
 * instead of raising `notFound()` — a boundary only ever renders in the
 * browser, never in the server's HTML — so this is the backstop for anything
 * that still raises one, and shows the same page the catch-all route does.
 */
export default async function WorkspaceNotFound() {
  const user = await requireUser();
  const stores = await accessibleStores(user);

  return (
    <>
      <AppHeader user={user} stores={stores} />
      <WorkspaceNotFoundView />
    </>
  );
}
