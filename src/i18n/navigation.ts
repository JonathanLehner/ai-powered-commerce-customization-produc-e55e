import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/** Locale-aware links for the public site. Workspace links stay on `next/link`. */
export const { Link, usePathname, getPathname } = createNavigation(routing);
