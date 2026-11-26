import Link from "next/link";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavbarLinkProps {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
}

const NavbarLink = ({ href, label, icon: Icon, active }: NavbarLinkProps) => (
  <Link
    href={href}
    aria-current={active ? "page" : undefined}
    className={cn(
      "relative flex h-10 items-center gap-3 rounded-md px-3 text-[15px] transition-colors",
      active
        ? "bg-white/[0.08] font-medium text-white before:absolute before:inset-y-2 before:-left-3 before:w-1.5 before:rounded-r-sm before:hazard-stripes"
        : "text-gray-200 hover:bg-white/5 hover:text-white"
    )}
  >
    <Icon className="size-5 shrink-0" strokeWidth={1.75} />
    <span className="truncate">{label}</span>
  </Link>
);

export default NavbarLink;
