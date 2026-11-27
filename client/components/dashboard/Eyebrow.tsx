import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface EyebrowProps {
  children: ReactNode;
  className?: string;
  as?: "p" | "h2";
}

/** A small mono label with an amber dash, as the sidebar's group labels. */
const Eyebrow = ({ children, className, as: Tag = "p" }: EyebrowProps) => (
  <Tag
    className={cn(
      "flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground",
      className
    )}
  >
    <span className="h-px w-3 shrink-0 bg-candido" aria-hidden />
    {children}
  </Tag>
);

export default Eyebrow;
