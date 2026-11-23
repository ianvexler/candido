import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import { InfoIcon } from "lucide-react";
import { ReactNode } from "react";

interface InfoTipProps {
  /** What the tooltip explains; also read out by screen readers. */
  children: ReactNode;
  /** Names the icon for screen readers, e.g. "About the review". */
  label: string;
  className?: string;
}

/** A small info icon that explains something on hover or keyboard focus. */
const InfoTip = ({ children, label, className }: InfoTipProps) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <button
        type="button"
        aria-label={label}
        className={cn(
          "inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
          className
        )}
      >
        <InfoIcon className="size-3.5" />
      </button>
    </TooltipTrigger>
    <TooltipContent className="max-w-64">{children}</TooltipContent>
  </Tooltip>
);

export default InfoTip;
