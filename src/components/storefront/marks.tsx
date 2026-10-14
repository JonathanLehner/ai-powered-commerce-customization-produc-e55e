import type { SocialNetwork } from "@/lib/storefront-layout";

/**
 * Small brand marks for the footer: social networks and the ways a shopper
 * can pay. Drawn inline so they cost no request and take the footer's colour.
 */

export function SocialIcon({ network }: { network: SocialNetwork }) {
  const common = { viewBox: "0 0 24 24", "aria-hidden": true, className: "size-5" } as const;
  switch (network) {
    case "instagram":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={1.8}>
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "x":
      return (
        <svg {...common} fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      );
    case "youtube":
      return (
        <svg {...common} fill="currentColor">
          <path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8c1.6.4 7.8.4 7.8.4s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8zM10 15V9l5.2 3z" />
        </svg>
      );
    case "facebook":
      return (
        <svg {...common} fill="currentColor">
          <path d="M13.5 22v-8h2.7l.4-3.2h-3.1V8.8c0-.9.3-1.6 1.6-1.6h1.7V4.4c-.3 0-1.3-.1-2.5-.1-2.5 0-4.1 1.5-4.1 4.2v2.3H7.4V14h2.8v8z" />
        </svg>
      );
    case "tiktok":
      return (
        <svg {...common} fill="currentColor">
          <path d="M16.6 3c.4 2.2 1.8 3.7 4.2 3.9v3.2c-1.5.1-2.9-.4-4.2-1.2v6.2c0 3.5-2.6 5.9-5.9 5.9S4.9 18.6 4.9 15.4c0-3.4 2.9-5.9 6.5-5.4v3.3c-1.6-.4-3.2.6-3.2 2.1 0 1.3 1 2.2 2.3 2.2 1.4 0 2.4-.9 2.4-2.8V3z" />
        </svg>
      );
    case "pinterest":
      return (
        <svg {...common} fill="currentColor">
          <path d="M12 2a10 10 0 0 0-3.6 19.3c-.1-.8-.2-2 0-2.9l1.2-5s-.3-.6-.3-1.5c0-1.4.8-2.4 1.8-2.4.9 0 1.3.6 1.3 1.4 0 .9-.6 2.2-.8 3.4-.3 1 .5 1.8 1.5 1.8 1.8 0 3.1-1.9 3.1-4.6 0-2.4-1.7-4.1-4.2-4.1-2.9 0-4.6 2.2-4.6 4.4 0 .9.3 1.8.8 2.3.1.1.1.2.1.3l-.3 1.2c0 .2-.2.3-.4.2-1.3-.6-2.1-2.5-2.1-4 0-3.3 2.4-6.3 6.9-6.3 3.6 0 6.4 2.6 6.4 6 0 3.6-2.3 6.5-5.4 6.5-1.1 0-2.1-.6-2.4-1.2l-.7 2.5c-.2.9-.9 2.1-1.3 2.8A10 10 0 1 0 12 2z" />
        </svg>
      );
  }
}

const FRAME = "inline-flex h-6 w-10 items-center justify-center rounded-[4px] border border-border";
const CARD = `${FRAME} bg-background`;

/** The payment methods checkout takes, as small card marks. */
export function PaymentMarks({ label }: { label: string }) {
  return (
    <ul aria-label={label} className="flex flex-wrap items-center gap-1.5">
      <li className={CARD} title="Visa">
        <svg viewBox="0 0 40 14" className="h-3" aria-hidden>
          <text x="20" y="11.5" textAnchor="middle" fontSize="13" fontStyle="italic" fontWeight="800" fill="#1a1f71" fontFamily="Arial, sans-serif">
            VISA
          </text>
        </svg>
      </li>
      <li className={CARD} title="Mastercard">
        <svg viewBox="0 0 32 20" className="h-4" aria-hidden>
          <circle cx="12" cy="10" r="7" fill="#eb001b" />
          <circle cx="20" cy="10" r="7" fill="#f79e1b" fillOpacity="0.9" />
        </svg>
      </li>
      <li className={`${FRAME} bg-[#2e77bc]`} title="American Express">
        <svg viewBox="0 0 40 14" className="h-2.5" aria-hidden>
          <text x="20" y="11" textAnchor="middle" fontSize="11" fontWeight="800" fill="#fff" fontFamily="Arial, sans-serif">
            AMEX
          </text>
        </svg>
      </li>
      <li className={CARD} title="Apple Pay">
        <svg viewBox="0 0 40 14" className="h-3" aria-hidden>
          <text x="20" y="11" textAnchor="middle" fontSize="11" fontWeight="600" fill="currentColor" fontFamily="-apple-system, Arial, sans-serif">
            Pay
          </text>
        </svg>
      </li>
      <li className={CARD} title="Google Pay">
        <svg viewBox="0 0 40 14" className="h-3" aria-hidden>
          <text x="20" y="11" textAnchor="middle" fontSize="11" fontWeight="600" fill="currentColor" fontFamily="Arial, sans-serif">
            G Pay
          </text>
        </svg>
      </li>
    </ul>
  );
}
