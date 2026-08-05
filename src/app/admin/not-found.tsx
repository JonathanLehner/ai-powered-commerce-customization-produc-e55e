import Link from "next/link";
import { FallbackPanel } from "@/components/ui";

/** A platform administration address that does not exist. The admin layout keeps its header and nav. */
export default function AdminNotFound() {
  return (
    <FallbackPanel
      eyebrow="404"
      title="We cannot find that page"
      description={
        <p>
          The address may be mistyped, or the supplier, catalog item or agency it pointed at may
          have been removed.
        </p>
      }
      actions={
        <>
          <Link href="/admin" className="btn-primary">
            Platform overview
          </Link>
          <Link href="/app" className="btn-secondary">
            Agency workspace
          </Link>
        </>
      }
    />
  );
}
