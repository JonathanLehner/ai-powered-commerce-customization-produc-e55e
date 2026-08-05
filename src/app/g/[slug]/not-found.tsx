import Link from "next/link";
import { FallbackPanel } from "@/components/ui";

/** A gift portal link that has expired, or a mistyped path inside one. */
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
