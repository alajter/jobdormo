"use client";
import Link from "next/link";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Briefcase, ChevronsLeft, ChevronsRight } from "lucide-react";
import { APP_CONSTANTS, SIDEBAR_LINKS } from "@/lib/constants";
import NavLink from "./NavLink";
import { ProfileDropdown } from "./ProfileDropdown";
import { usePathname } from "next/navigation";
import { useSidebar } from "@/context/SidebarContext";
import { cn } from "@/lib/utils";
import { CurrentUser } from "@/models/user.model";

interface SidebarProps {
  user: CurrentUser | null;
  signOutAction: () => void;
}

function Sidebar({ user, signOutAction }: SidebarProps) {
  const path = usePathname();
  const { expanded, toggle } = useSidebar();
  const isOnDashboard = path === "/dashboard";

  return (
    <TooltipProvider delayDuration={300}>
      <aside
        id={APP_CONSTANTS.SIDEBAR_DOM_ID}
        className={cn(
          "fixed inset-y-0 left-0 z-10 hidden flex-col border-r bg-background transition-[width] duration-200 ease-in-out sm:flex",
          expanded
            ? APP_CONSTANTS.SIDEBAR_WIDTH.expanded.rail
            : APP_CONSTANTS.SIDEBAR_WIDTH.collapsed.rail,
        )}
      >
        <div className="flex h-14 shrink-0 items-center overflow-hidden sm:mt-2">
          <div className="flex w-14 shrink-0 items-center justify-center">
            <Link
              href="/dashboard"
              aria-current={isOnDashboard ? "page" : undefined}
              onClick={(e) => {
                if (isOnDashboard) e.preventDefault();
              }}
              className="group flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground md:h-8 md:w-8"
            >
              <Briefcase className="h-4 w-4 transition-transform group-hover:scale-110" />
              <span className="sr-only">Jobdormo</span>
            </Link>
          </div>
          <span
            className={cn(
              "truncate font-semibold transition-opacity duration-200",
              expanded ? "opacity-100 delay-100" : "opacity-0",
            )}
          >
            Jobdormo
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto py-2">
          {SIDEBAR_LINKS.map((item) => {
            // Only show dev-only items in development mode
            if (item.devOnly && process.env.NODE_ENV !== "development") {
              return null;
            }
            return (
              <NavLink
                key={item.label}
                label={item.label}
                Icon={item.icon}
                route={item.route}
                href={item.href}
                pathname={path}
                expanded={expanded}
              />
            );
          })}
        </nav>

        <div className="flex flex-col gap-1 border-t py-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={toggle}
                aria-expanded={expanded}
                aria-controls={APP_CONSTANTS.SIDEBAR_DOM_ID}
                aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
                className="flex h-10 w-full items-center text-muted-foreground hover:text-foreground"
              >
                <span className="flex h-full w-14 shrink-0 items-center justify-center">
                  {expanded ? (
                    <ChevronsLeft className="h-5 w-5" strokeWidth={1.5} />
                  ) : (
                    <ChevronsRight className="h-5 w-5" strokeWidth={1.5} />
                  )}
                </span>
                <span
                  className={cn(
                    "truncate text-sm transition-opacity duration-200",
                    expanded ? "opacity-100 delay-100" : "opacity-0",
                  )}
                >
                  Collapse
                </span>
              </button>
            </TooltipTrigger>
            {!expanded && (
              <TooltipContent side="right">
                Expand sidebar
                <kbd className="ml-2 rounded-sm border px-1 text-[10px]">⌘B</kbd>
              </TooltipContent>
            )}
          </Tooltip>
          <ProfileDropdown
            user={user}
            expanded={expanded}
            signOutAction={signOutAction}
          />
        </div>
      </aside>
    </TooltipProvider>
  );
}

export default Sidebar;
