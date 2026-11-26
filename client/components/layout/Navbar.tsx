"use client";

import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import Image from "next/image";
import Logo from "@/lib/images/SmallLogo.png";
import Wordmark from "@/lib/images/Wordmark.png";
import { usePathname } from "next/navigation";
import { isBareRoute } from "@/lib/routes";
import { mobileTabs, navGroups } from "@/lib/navigation";
import useJobCounts, { activeCount } from "@/lib/jobBoard/useJobCounts";
import useSidebarStore from "@/lib/stores/sidebarStore";
import { cn } from "@/lib/utils";
import { MessageSquareTextIcon, PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";
import AccountMenu from "./AccountMenu";
import FeedbackCard from "./FeedbackCard";
import JobsPipeline from "./JobsPipeline";
import NavbarLink from "./NavbarLink";

const Navbar = () => {
  const { isAuthenticated } = useAuth();
  const pathname = usePathname();
  const collapsed = useSidebarStore((state) => state.collapsed);
  const toggleCollapsed = useSidebarStore((state) => state.toggleCollapsed);
  const showNav = isAuthenticated && !isBareRoute(pathname);
  const counts = useJobCounts(pathname, showNav);

  if (!showNav) {
    return null;
  }

  const CollapseIcon = collapsed ? PanelLeftOpenIcon : PanelLeftCloseIcon;

  return (
    <>
      {/* Desktop */}
      <aside
        className={cn(
          "hidden md:flex fixed left-0 top-0 z-10 h-screen shrink-0 flex-col bg-candido-ink px-3 py-4 transition-[width] duration-200",
          collapsed ? "w-16" : "w-60"
        )}
      >
        <div className={cn("mb-6 flex items-center gap-2.5", collapsed ? "flex-col" : "pl-3 pr-1.5")}>
          <Link href="/dashboard" className="flex min-w-0 items-center" aria-label="Candido">
            {collapsed ? (
              <Image src={Logo} alt="" width={30} height={32} className="shrink-0 rounded" />
            ) : (
              <Image src={Wordmark} alt="" height={28} className="w-auto" priority />
            )}
          </Link>
          <button
            onClick={toggleCollapsed}
            className={cn(
              "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-white/5 hover:text-white",
              // The hat sits above the letters, so nudge down to line up with them.
              collapsed ? "mt-2" : "ml-auto translate-y-0.5"
            )}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <CollapseIcon className="size-4.5" strokeWidth={1.75} />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1" aria-label="Main">
          {navGroups.map((group, index) => (
            <div key={group.label} className="flex flex-col gap-1">
              {collapsed ? (
                index > 0 && <div className="mx-2 my-2 border-t border-white/10" aria-hidden />
              ) : (
                <p
                  className={cn(
                    "flex items-center gap-2 whitespace-nowrap px-3 pb-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-gray-400",
                    index > 0 ? "pt-5" : "pt-1"
                  )}
                >
                  <span className="h-px w-3 bg-candido" aria-hidden />
                  {group.label}
                  {group.label === "Job search" && counts && activeCount(counts) > 0 && (
                    <span className="ml-auto text-[13px] tracking-normal tabular-nums text-candido" title="Active applications">
                      {activeCount(counts)}
                    </span>
                  )}
                </p>
              )}
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
              {group.label === "Job search" && counts && !collapsed && <JobsPipeline counts={counts} />}
            </div>
          ))}
        </nav>

        <div className="flex flex-col gap-1">
          {collapsed ? (
            <NavbarLink
              href="/feedback"
              label="Send feedback"
              icon={MessageSquareTextIcon}
              active={pathname === "/feedback"}
              collapsed
              muted
            />
          ) : (
            <FeedbackCard />
          )}
          <div className="mt-2 border-t border-white/10 pt-3">
            <AccountMenu variant="sidebar" collapsed={collapsed} />
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
