import { AppHeader } from "@/components/AppHeader";
import { notFoundRobots, WorkspaceNotFoundView } from "@/components/NotFoundViews";
import { accessibleStores, requireUser } from "@/lib/session";

/**
 * A workspace address that does not exist. The header is rendered here because
 * the workspace root layout leaves it to each route, so this still carries the
 * store switcher and the account menu — and it is a page rather than a raised
 * `notFound()`, so all of it is in the server-rendered HTML.
 */
export const metadata = notFoundRobots;

export default async function WorkspaceCatchAll() {
  const user = await requireUser();
  const stores = await accessibleStores(user);

  return (
    <>
      <AppHeader user={user} stores={stores} />
      <WorkspaceNotFoundView />
    </>
  );
}
