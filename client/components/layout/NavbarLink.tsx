import Link from "next/link";
import { LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";

interface NavbarLinkProps {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  collapsed: boolean;
  /** Secondary links, like feedback, sit quieter than the pages. */
  muted?: boolean;
  /** A count shown at the end of the link, like active jobs. */
  badge?: number;
}

const NavbarLink = ({ href, label, icon: Icon, active, collapsed, muted, badge }: NavbarLinkProps) => {
  const link = (
    <Link
      href={href}
      aria-label={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-9 items-center gap-3 rounded-md text-sm transition-colors",
        collapsed ? "w-10 justify-center" : "px-3",
        active
          ? "bg-white/[0.08] font-medium text-white before:absolute before:inset-y-1.5 before:-left-3 before:w-1.5 before:rounded-r-sm before:hazard-stripes"
          : cn("hover:bg-white/5 hover:text-white", muted ? "text-gray-500" : "text-gray-400")
      )}
    >
      <Icon className="size-4.5 shrink-0" strokeWidth={1.75} />
      {!collapsed && <span className="truncate">{label}</span>}
      {!collapsed && badge !== undefined && badge > 0 && (
        <span className="ml-auto font-mono text-xs tabular-nums text-candido">{badge}</span>
      )}
    </Link>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {badge ? `${label} · ${badge} active` : label}
      </TooltipContent>
    </Tooltip>
  );
};

export default NavbarLink;
