"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function StoreNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Store sections" className="border-b border-line bg-white">
      <div className="mx-auto w-full max-w-[92rem] px-2 sm:px-6">
        <ul className="-mb-px flex gap-1 overflow-x-auto">
          {items.map((item) => {
            const active =
              pathname === item.href ||
              (item.href.split("/").length > 4 && pathname.startsWith(`${item.href}/`));
            return (
              <li key={item.href} className="shrink-0">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={
                    active
                      ? "block border-b-2 border-brand-600 px-3 py-3 text-sm font-semibold text-brand-700"
                      : "block border-b-2 border-transparent px-3 py-3 text-sm font-medium text-inksoft hover:border-line hover:text-ink"
                  }
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
