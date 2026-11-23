import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface DashboardCardProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

const DashboardCard = ({ title, description, children, className }: DashboardCardProps) => (
  <Card className={cn("min-w-0", className)}>
    <CardHeader className="gap-0.5 px-6 pt-2">
      <CardTitle className="text-base">
        <h2>{title}</h2>
      </CardTitle>
      {description && <CardDescription>{description}</CardDescription>}
    </CardHeader>
    <CardContent className="px-6 pb-2 flex-1">{children}</CardContent>
  </Card>
);

export default DashboardCard;
