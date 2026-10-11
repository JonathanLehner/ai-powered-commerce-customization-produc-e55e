import { Avatar, AvatarFallback } from "@/components/ui/avatar";

function storeInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * The store's mark in the storefront and gift portal headers.
 *
 * Uploaded logos come in any shape — the seeded ones are 2:1 with a transparent
 * margin — so the logo is sized by height alone and keeps its own aspect ratio.
 * Squeezing it into a square box shrank a wide logo to a sliver. A store with
 * no logo gets its initials in an Avatar filled with the store colour.
 */
export function StoreMark({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  if (logoUrl) {
    return (
      // Uploaded logos have no prebuilt variants, so next/image would only hand
      // back the same URL; a plain img lets the width follow the file.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        decoding="async"
        className="h-8 w-auto max-w-32 shrink-0 object-contain sm:h-10 sm:max-w-40"
      />
    );
  }
  return (
    <Avatar size="lg" aria-hidden className="size-8 sm:size-10">
      <AvatarFallback className="bg-primary font-heading text-sm font-semibold text-primary-foreground">
        {storeInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
