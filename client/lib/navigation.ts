import { FileUserIcon, LayoutDashboardIcon, LibraryBigIcon, LucideIcon, SquareKanbanIcon, Table2Icon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  isActive: (pathname: string) => boolean;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

const isUnder = (pathname: string, path: string) => pathname === path || pathname.startsWith(`${path}/`);

export const isSectionLibraryPath = (pathname: string) => isUnder(pathname, "/resume/sections");

export const isCvPath = (pathname: string) => isUnder(pathname, "/resume") && !isSectionLibraryPath(pathname);

export const dashboardItem: NavItem = {
  href: "/dashboard",
  label: "Dashboard",
  icon: LayoutDashboardIcon,
  isActive: (pathname) => isUnder(pathname, "/dashboard"),
};

export const boardItem: NavItem = {
  href: "/board",
  label: "Board",
  icon: SquareKanbanIcon,
  isActive: (pathname) => isUnder(pathname, "/board"),
};

export const sheetItem: NavItem = {
  href: "/sheet",
  label: "Sheet",
  icon: Table2Icon,
  isActive: (pathname) => isUnder(pathname, "/sheet"),
};

export const cvsItem: NavItem = {
  href: "/resume",
  label: "CVs",
  icon: FileUserIcon,
  isActive: isCvPath,
};

export const sectionLibraryItem: NavItem = {
  href: "/resume/sections",
  label: "Section library",
  icon: LibraryBigIcon,
  isActive: isSectionLibraryPath,
};

export const navGroups: NavGroup[] = [
  { label: "Overview", items: [dashboardItem] },
  { label: "Job search", items: [boardItem, sheetItem] },
  { label: "Documents", items: [cvsItem, sectionLibraryItem] },
];

/** The pages on the mobile tab bar; the rest sit in its account menu. */
export const mobileTabs: NavItem[] = [dashboardItem, boardItem, sheetItem, cvsItem];
