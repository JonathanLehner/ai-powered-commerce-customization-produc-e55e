"use client";

import { usePathname } from "next/navigation";
import { StoreWorkspaceNotFoundView } from "@/components/NotFoundViews";
import { storeBasePath } from "@/lib/util";

/**
 * The store workspace's not-found boundary. The routes render the same body
 * themselves so it is in the server's HTML; this remains as the backstop, and
 * reads the store it is standing in from the path because a boundary is handed
 * no params.
 */
export default function StoreWorkspaceNotFound() {
  return <StoreWorkspaceNotFoundView base={storeBasePath(usePathname())} />;
}
