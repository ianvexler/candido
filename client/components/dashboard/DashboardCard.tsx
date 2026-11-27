import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface DashboardCardProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

const DashboardCard = ({ title, description, children, className }: DashboardCardProps) => (
  <section className={cn("flex min-w-0 flex-col gap-5 rounded-xl border bg-card p-6 shadow-sm", className)}>
    <header>
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
    </header>
    <div className="flex flex-1 flex-col">{children}</div>
  </section>
);

export default DashboardCard;
