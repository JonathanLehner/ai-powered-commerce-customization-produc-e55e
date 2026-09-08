import Link from "next/link";
import { FallbackPanel } from "@/components/ui";

/**
 * The gift portal's not-found boundary. Portal routes render their own
 * not-found body so it reaches the browser as HTML; a boundary is handed no
 * params, so this backstop cannot name the catalogue and stays generic.
 */
export default function GiftPortalNotFound() {
  return (
    <FallbackPanel
      eyebrow="Gift portal"
      title="We cannot find that page"
      description={
        <p>
          The link may have expired, or the gift catalogue may have been closed by the company that
          set it up. If someone sent you this link, ask them for a current one.
        </p>
      }
      actions={
        <Link href="/" className="btn-primary">
          Go to Parcelith
        </Link>
      }
    />
  );
}
