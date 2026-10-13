import { AppHeaderBar } from "@/components/AppHeaderBar";
import type { AccessibleStore } from "@/lib/session";
import type { Store, User } from "@/lib/types";

/** What the header shows of the signed-in user. */
export type HeaderUser = Pick<User, "name" | "email" | "title" | "platformRole" | "notificationPrefs">;

/** What the store switcher shows of a store. */
export type HeaderStore = Omit<AccessibleStore, "store"> & {
  store: Pick<Store, "id" | "name" | "clientName" | "status">;
};

/**
 * The workspace header. Only the fields it displays are handed to the browser:
 * the full user and store records ran to some fifty kilobytes on every page,
 * twice over in the document and its component payload. Archived stores are
 * left out, except the one being viewed, whose name the switcher shows.
 */
export function AppHeader({
  user,
  stores,
  currentStoreId,
}: {
  user: User;
  stores: AccessibleStore[];
  currentStoreId?: string;
}) {
  return (
    <AppHeaderBar
      user={{
        name: user.name,
        email: user.email,
        title: user.title,
        platformRole: user.platformRole,
        notificationPrefs: user.notificationPrefs,
      }}
      stores={stores
        .filter(({ store }) => store.status === "active" || store.id === currentStoreId)
        .map(({ store, role, viaPlatform }) => ({
          store: { id: store.id, name: store.name, clientName: store.clientName, status: store.status },
          role,
          viaPlatform,
        }))}
      currentStoreId={currentStoreId}
    />
  );
}
