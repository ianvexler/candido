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
}

const NavbarLink = ({ href, label, icon: Icon, active, collapsed }: NavbarLinkProps) => {
  const link = (
    <Link
      href={href}
      aria-label={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        // A fixed left padding keeps the icon centred in the collapsed bar too.
        "relative flex h-10 items-center gap-3 rounded-md px-2.5 text-[15px] transition-colors",
        active
          ? "bg-white/[0.08] font-medium text-white before:absolute before:inset-y-2 before:-left-3 before:w-1.5 before:rounded-r-sm before:hazard-stripes"
          : "text-gray-200 hover:bg-white/5 hover:text-white"
      )}
    >
      <Icon className="size-5 shrink-0" strokeWidth={1.75} />
      <span className={cn("whitespace-nowrap transition-opacity duration-200", collapsed && "opacity-0")}>
        {label}
      </span>
    </Link>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
};

export default NavbarLink;
