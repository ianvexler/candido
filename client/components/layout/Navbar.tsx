"use client";

import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import Image from "next/image";
import Logo from "@/lib/images/SmallLogo.png";
import { usePathname } from "next/navigation";
import { isBareRoute } from "@/lib/routes";
import { mobileTabs, navGroups } from "@/lib/navigation";
import useSidebarStore from "@/lib/stores/sidebarStore";
import { cn } from "@/lib/utils";
import { MessageSquareTextIcon, PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";
import AccountMenu from "./AccountMenu";
import NavbarLink from "./NavbarLink";

const Navbar = () => {
  const { isAuthenticated } = useAuth();
  const pathname = usePathname();
  const collapsed = useSidebarStore((state) => state.collapsed);
  const toggleCollapsed = useSidebarStore((state) => state.toggleCollapsed);

  if (!isAuthenticated || isBareRoute(pathname)) {
    return null;
  }

  const CollapseIcon = collapsed ? PanelLeftOpenIcon : PanelLeftCloseIcon;

  return (
    <>
      {/* Desktop */}
      <aside
        className={cn(
          "hidden md:flex fixed left-0 top-0 z-10 h-screen shrink-0 flex-col bg-candido-black px-3 py-4 transition-[width] duration-200",
          collapsed ? "w-16" : "w-56"
        )}
      >
        <div className={cn("mb-4 flex items-center gap-2.5", collapsed ? "flex-col" : "px-1")}>
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5" aria-label="Candido">
            <Image src={Logo} alt="" width={30} height={32} className="shrink-0 rounded" />
            {!collapsed && <span className="truncate text-base font-semibold text-white">Candido</span>}
          </Link>
          <button
            onClick={toggleCollapsed}
            className={cn(
              "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-white/5 hover:text-white",
              collapsed ? "mt-2" : "ml-auto"
            )}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <CollapseIcon className="size-4.5" strokeWidth={1.75} />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1" aria-label="Main">
          {navGroups.map((group, index) => (
            <div key={group.label ?? index} className="flex flex-col gap-1">
              {group.label &&
                (collapsed ? (
                  <div className="mx-2 my-2 border-t border-white/10" aria-hidden />
                ) : (
                  <p className="px-3 pt-4 pb-1 text-xs font-medium text-gray-500">{group.label}</p>
                ))}
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
            </div>
          ))}
        </nav>

        <div className="flex flex-col gap-1">
          <NavbarLink
            href="/feedback"
            label="Send feedback"
            icon={MessageSquareTextIcon}
            active={pathname === "/feedback"}
            collapsed={collapsed}
            muted
          />
          <div className="mt-2 border-t border-white/10 pt-3">
            <AccountMenu variant="sidebar" collapsed={collapsed} />
          </div>
        </div>
      </aside>

      {/* Mobile */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-10 grid grid-cols-4 border-t border-white/10 bg-candido-black pb-[env(safe-area-inset-bottom)]"
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
                "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                active ? "text-candido" : "text-gray-400 hover:text-white"
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
