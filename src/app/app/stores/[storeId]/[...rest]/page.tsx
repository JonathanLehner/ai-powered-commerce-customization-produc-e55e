import { notFoundRobots, StoreWorkspaceNotFoundView } from "@/components/NotFoundViews";

/**
 * An address inside a store's workspace that matches no page. The store layout
 * above keeps the app header and the store's own navigation, so this is only
 * the body — plus the way back into the store the user was already in.
 */
export const metadata = notFoundRobots;

export default async function StoreWorkspaceCatchAll({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  return <StoreWorkspaceNotFoundView base={`/app/stores/${storeId}`} />;
}
