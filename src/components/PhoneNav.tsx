"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SIDEBAR_LINKS } from "@/lib/constants";
import { cn } from "@/lib/utils";

// Phone only: the five places as a bottom bar, in thumb reach.
export function PhoneNav() {
  const path = usePathname();
  const links = SIDEBAR_LINKS.filter((l) => !l.devOnly);
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 grid border-t bg-background pb-[env(safe-area-inset-bottom)] sm:hidden"
      style={{ gridTemplateColumns: `repeat(${links.length}, minmax(0, 1fr))` }}
    >
      {links.map((l) => {
        const active = path === l.route || (l.route !== "/dashboard" && path.startsWith(`${l.route}/`));
        return (
          <Link
            key={l.route}
            href={l.href ?? l.route}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-14 flex-col items-center justify-center gap-0.5 text-[11px]",
              active ? "font-semibold text-foreground" : "text-muted-foreground",
            )}
          >
            <l.icon className="h-5 w-5" strokeWidth={active ? 2 : 1.5} />
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
