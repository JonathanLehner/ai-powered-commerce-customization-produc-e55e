import { AdminNotFoundView, notFoundRobots } from "@/components/NotFoundViews";

/** A platform administration address that does not exist. The admin layout keeps its header and nav. */
export const metadata = notFoundRobots;

export default function AdminCatchAll() {
  return <AdminNotFoundView />;
}
