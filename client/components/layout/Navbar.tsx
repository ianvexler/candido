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
import { ChevronLeftIcon } from "lucide-react";
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

  return (
    <>
      {/* Desktop. Every item keeps its icon in the same place in both widths, so
          collapsing only slides the edge and fades the text. */}
      <aside
        className={cn(
          "hidden md:block fixed left-0 top-0 z-10 h-screen shrink-0 bg-candido-ink transition-[width] duration-200 ease-in-out",
          collapsed ? "w-16" : "w-60"
        )}
      >
        <div className="flex h-full flex-col overflow-hidden px-3 py-4">
          <Link href="/dashboard" className="relative mb-6 block h-11 shrink-0" aria-label="Candido">
            <Image
              src={Logo}
              alt=""
              width={32}
              height={34}
              className={cn(
                "absolute left-1 top-1/2 -translate-y-1/2 rounded transition-opacity duration-200",
                collapsed ? "opacity-100" : "opacity-0"
              )}
            />
            <Image
              src={Wordmark}
              alt=""
              height={34}
              priority
              className={cn(
                "absolute left-3 top-1/2 w-auto max-w-none -translate-y-1/2 transition-opacity duration-200",
                collapsed ? "opacity-0" : "opacity-100"
              )}
            />
          </Link>

          <nav className="flex flex-1 flex-col gap-1" aria-label="Main">
            {navGroups.map((group, index) => (
              <div key={group.label} className="flex flex-col gap-1">
                <p
                  className={cn(
                    "flex items-center gap-2 whitespace-nowrap pl-3.5 pr-3 pb-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-gray-400",
                    index > 0 ? "pt-5" : "pt-1"
                  )}
                >
                  <span className="h-px w-3 shrink-0 bg-candido" aria-hidden />
                  <span className={cn("transition-opacity duration-200", collapsed && "opacity-0")}>{group.label}</span>
                  {group.label === "Job search" && counts && activeCount(counts) > 0 && (
                    <span
                      className={cn(
                        "ml-auto text-[13px] tracking-normal tabular-nums text-candido transition-opacity duration-200",
                        collapsed && "opacity-0"
                      )}
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
                {group.label === "Job search" && counts && (
                  <div
                    className={cn(
                      "grid transition-[grid-template-rows,opacity] duration-200 ease-in-out",
                      collapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr]"
                    )}
                    aria-hidden={collapsed}
                  >
                    <div className="min-h-0 overflow-hidden">
                      <JobsPipeline counts={counts} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </nav>

          <div className="flex flex-col gap-1">
            <FeedbackCard collapsed={collapsed} />
            <div className="mt-2 border-t border-white/10 pt-3">
              <AccountMenu variant="sidebar" collapsed={collapsed} />
            </div>
          </div>
        </div>

        <button
          onClick={toggleCollapsed}
          className="absolute -right-3 top-[38px] z-20 flex size-6 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-candido-ink text-gray-400 shadow-sm transition-colors hover:border-candido/60 hover:text-candido"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronLeftIcon
            className={cn("size-3.5 transition-transform duration-200", collapsed && "rotate-180")}
            strokeWidth={2}
          />
        </button>
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
