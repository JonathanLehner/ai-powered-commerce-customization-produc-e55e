"use client";

import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * The storefront header's menu on small screens. The header there is one row,
 * so the links and the language and currency pickers move into this drawer.
 * The pickers are passed in as `children` so they are the same controls the
 * desktop header shows.
 */
export function StorefrontMenu({
  links,
  children,
}: {
  links: { href: string; label: string }[];
  children: React.ReactNode;
}) {
  const t = useTranslations("storefront.chrome");
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-lg" aria-label={t("menu")}>
          <Menu aria-hidden className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" aria-describedby={undefined} className="gap-0">
        <SheetHeader>
          <SheetTitle>{t("menu")}</SheetTitle>
        </SheetHeader>
        <Separator />
        <nav aria-label={t("shop")} className="flex flex-col gap-1 p-2">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "justify-start text-base")}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <Separator />
        <div className="flex flex-col gap-3 p-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
