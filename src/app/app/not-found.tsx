import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { FallbackPanel } from "@/components/ui";
import { accessibleStores, requireUser } from "@/lib/session";

/**
 * A workspace address that does not exist. The header is rendered here because
 * the workspace root layout leaves it to each route, so a 404 still carries the
 * store switcher and the account menu.
 */
export default async function WorkspaceNotFound() {
  const user = await requireUser();
  const stores = await accessibleStores(user);

  return (
    <>
      <AppHeader user={user} stores={stores} />
      <FallbackPanel
        eyebrow="404"
        title="We cannot find that page"
        description={
          <p>
            The address may be mistyped, or the store, product or order it pointed at may have been
            removed. Everything you have access to is on the dashboard.
          </p>
        }
        actions={
          <>
            <Link href="/app" className="btn-primary">
              Go to the dashboard
            </Link>
            <Link href="/app/stores/new" className="btn-secondary">
              Create a client store
            </Link>
          </>
        }
      />
    </>
  );
}
