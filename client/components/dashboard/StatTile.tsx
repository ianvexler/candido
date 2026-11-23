import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";

interface StatTileProps {
  label: string;
  value: string | number;
  detail: ReactNode;
  icon: LucideIcon;
  iconClassName: string;
}

const StatTile = ({ label, value, detail, icon: Icon, iconClassName }: StatTileProps) => (
  <Card className="flex-row items-start justify-between gap-3 p-5">
    <div className="min-w-0">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
    <div className={cn("hidden sm:block shrink-0 rounded-lg p-2.5", iconClassName)} aria-hidden>
      <Icon className="size-5" />
    </div>
  </Card>
);

export default StatTile;
