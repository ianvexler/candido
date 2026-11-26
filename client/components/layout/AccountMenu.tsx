"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsUpDownIcon, LogOutIcon, MessageSquareTextIcon, SettingsIcon, ShieldCheckIcon, UserIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface AccountMenuProps {
  /** "sidebar" sits at the foot of the desktop sidebar; "tab" is the last tab on the mobile bar. */
  variant: "sidebar" | "tab";
  collapsed?: boolean;
}

const initialsOf = (name?: string, email?: string) => {
  const words = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (words.length > 0) return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
  return email?.[0]?.toUpperCase() ?? "?";
};

const AccountMenu = ({ variant, collapsed = false }: AccountMenuProps) => {
  const { user, isAdmin, handleLogout } = useAuth();
  const pathname = usePathname();
  const initials = initialsOf(user?.name, user?.email);
  const accountActive = ["/settings", "/admin", "/feedback"].includes(pathname);

  const avatar = (
    <span
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-candido text-xs font-semibold text-candido-black"
      aria-hidden
    >
      {initials}
    </span>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "sidebar" ? (
          <button
            className={cn(
              "flex w-full cursor-pointer items-center gap-2.5 rounded-md py-1.5 text-left text-[15px] text-gray-100 transition-colors hover:bg-white/5 hover:text-white data-[state=open]:bg-white/10",
              collapsed ? "justify-center" : "px-2"
            )}
            aria-label="Account"
          >
            {avatar}
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1 truncate">{user?.name || user?.email}</span>
                <ChevronsUpDownIcon className="size-4 shrink-0 text-gray-400" />
              </>
            )}
          </button>
        ) : (
          <button
            className={cn(
              "flex h-16 cursor-pointer flex-col items-center justify-center gap-1 text-xs font-medium transition-colors",
              accountActive ? "text-candido" : "text-gray-300 hover:text-white"
            )}
          >
            <UserIcon className="size-5" strokeWidth={1.75} />
            Account
          </button>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side={variant === "sidebar" ? "right" : "top"}
        align="end"
        sideOffset={variant === "sidebar" ? 12 : 6}
        className="w-56"
      >
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-medium">{user?.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <SettingsIcon />
            Settings
          </Link>
        </DropdownMenuItem>
        {variant === "tab" && (
          <DropdownMenuItem asChild>
            <Link href="/feedback">
              <MessageSquareTextIcon />
              Send feedback
            </Link>
          </DropdownMenuItem>
        )}
        {isAdmin && (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <ShieldCheckIcon />
              Admin
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => handleLogout()}>
          <LogOutIcon />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default AccountMenu;
