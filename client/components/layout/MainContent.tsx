"use client";

import { useAuth } from "@/contexts/AuthContext";
import { isBareRoute } from "@/lib/routes";
import useSidebarStore from "@/lib/stores/sidebarStore";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";

interface MainContentProps {
  children: React.ReactNode;
}

const MainContent = ({ children }: MainContentProps) => {
  const { isAuthenticated } = useAuth();
  const collapsed = useSidebarStore((state) => state.collapsed);
  const pathname = usePathname();

  if (isBareRoute(pathname)) {
    return <div className="flex flex-1 flex-col min-w-0">{children}</div>;
  }

  const isLanding = pathname === "/";
  const hasNav = isAuthenticated && !isLanding;
  // Pages that manage their own scrolling panes.
  const isFullHeight = pathname === "/board" || pathname.startsWith("/board/") || pathname.startsWith("/resume/");

  return (
    <div
      className={cn(
        "flex flex-1 flex-col min-w-0",
        // Room for the sidebar on desktop and the tab bar on mobile.
        hasNav && "pb-16 md:pb-0 md:transition-[padding] md:duration-200 md:ease-in-out",
        hasNav && (collapsed ? "md:pl-16" : "md:pl-60"),
        isFullHeight ? "h-screen overflow-hidden" : "min-h-screen overflow-y-auto"
      )}
    >
      {children}
    </div>
  );
};

export default MainContent;
