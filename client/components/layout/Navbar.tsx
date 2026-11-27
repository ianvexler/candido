"use client";

import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import Image from "next/image";
import Wordmark from "@/lib/images/Wordmark.png";
import SmallLogo from "@/lib/images/SmallLogo.png";
import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { isBareRoute } from "@/lib/routes";
import { mobileTabs, navGroups } from "@/lib/navigation";
import useJobCounts, { activeCount } from "@/lib/jobBoard/useJobCounts";
import useSidebarCollapsed from "@/lib/sidebar";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import AccountMenu from "./AccountMenu";
import FeedbackCard from "./FeedbackCard";
import JobsPipeline from "./JobsPipeline";
import NavbarLink from "./NavbarLink";

const Navbar = () => {
  const { isAuthenticated } = useAuth();
  const pathname = usePathname();
  const showNav = isAuthenticated && !isBareRoute(pathname);
  const counts = useJobCounts(pathname, showNav);
  const { collapsed, toggle } = useSidebarCollapsed();

  if (!showNav) {
    return null;
  }

  return (
    <>
      {/* Desktop */}
      {/* The width animates between w-60 and a w-17 icon rail: px-3 either side of
          h-10 rows 2.75rem wide, which keeps every icon exactly where it sits in the full sidebar. */}
      <aside
        className="hidden md:flex fixed left-0 top-0 z-10 h-screen w-60 shrink-0 flex-col overflow-x-hidden bg-candido-ink px-3 py-4 transition-[width] duration-200 ease-out sidebar-collapsed:w-17"
        aria-label="Sidebar"
      >
        <div className="relative mb-6 flex h-11 shrink-0 items-center">
          <Link
            href="/dashboard"
            className="flex h-full min-w-0 items-center px-3 transition-[padding] duration-200 ease-out sidebar-collapsed:px-2"
            aria-label="Candido"
          >
            <Image
              src={Wordmark}
              alt=""
              height={34}
              priority
              className="w-auto sidebar-collapsed:hidden"
            />
            <Image src={SmallLogo} alt="" className="hidden h-7 w-auto sidebar-collapsed:block" />
          </Link>

          {/* Collapse sits beside the wordmark; on the rail it hides behind the logo until hovered. */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={toggle}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-expanded={!collapsed}
                className={cn(
                  "absolute right-0 top-1/2 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-gray-400 transition-[color,background-color,opacity] hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-candido",
                  "sidebar-collapsed:inset-0 sidebar-collapsed:size-full sidebar-collapsed:translate-y-0 sidebar-collapsed:bg-candido-ink sidebar-collapsed:opacity-0 sidebar-collapsed:hover:bg-[color-mix(in_oklab,var(--candido-ink),white_5%)] sidebar-collapsed:hover:opacity-100 sidebar-collapsed:focus-visible:opacity-100"
                )}
              >
                {collapsed ? (
                  <PanelLeftOpenIcon className="size-5" strokeWidth={1.75} />
                ) : (
                  <PanelLeftCloseIcon className="size-[18px]" strokeWidth={1.75} />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={collapsed ? 14 : 8}>
              {collapsed ? "Expand sidebar" : "Collapse sidebar"}
            </TooltipContent>
          </Tooltip>
        </div>

        <nav className="flex flex-1 flex-col gap-1" aria-label="Main">
          {navGroups.map((group, index) => (
            <div key={group.label} className="flex flex-col gap-1">
              <p
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap px-3 pb-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-gray-400",
                  index > 0 ? "pt-5" : "pt-1"
                )}
              >
                {/* On the rail the dash widens to span the icons below, standing in for the label. */}
                <span
                  className="h-px w-3 shrink-0 bg-candido transition-[width] duration-200 ease-out sidebar-collapsed:w-5"
                  aria-hidden
                />
                <span className="transition-opacity duration-150 sidebar-collapsed:opacity-0">{group.label}</span>
                {group.showsJobCounts && counts && activeCount(counts) > 0 && (
                  <span
                    className="ml-auto text-[13px] tracking-normal tabular-nums text-candido transition-opacity duration-150 sidebar-collapsed:opacity-0"
                    title="Active applications"
                  >
                    {activeCount(counts)}
                  </span>
                )}
              </p>
              {group.items.map((item) => (
                <NavbarLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  active={item.isActive(pathname)}
                  collapsed={collapsed}
                />
              ))}
              {group.showsJobCounts && counts && <JobsPipeline counts={counts} />}
            </div>
          ))}
        </nav>

        <div className="flex flex-col gap-1">
          <FeedbackCard collapsed={collapsed} />
          <div className="mt-2 border-t border-white/10 pt-3">
            <AccountMenu variant="sidebar" />
          </div>
        </div>
      </aside>

      {/* Mobile */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-10 grid grid-cols-5 border-t border-white/10 bg-candido-ink pb-[env(safe-area-inset-bottom)]"
        aria-label="Main"
      >
        {mobileTabs.map(({ href, label, icon: Icon, isActive }) => {
          const active = isActive(pathname);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors",
                active
                  ? "text-candido before:absolute before:inset-x-4 before:top-0 before:h-1 before:rounded-b-sm before:hazard-stripes"
                  : "text-gray-300 hover:text-white"
              )}
            >
              <Icon className="size-5" strokeWidth={1.75} />
              {label}
            </Link>
          );
        })}
        <AccountMenu variant="tab" />
      </nav>
    </>
  );
};

export default Navbar;
