import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import { InfoIcon } from "lucide-react";
import { ReactNode, useState } from "react";

interface InfoTipProps {
  /** What the tooltip explains; also read out by screen readers. */
  children: ReactNode;
  /** Names the icon for screen readers, e.g. "About the review". */
  label: string;
  className?: string;
}

/** A small info icon that explains something on hover, keyboard focus or tap. */
const InfoTip = ({ children, label, className }: InfoTipProps) => {
  const [open, setOpen] = useState(false);

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          // Radix closes tooltips on click and never opens them on touch; preventDefault skips that.
          onClick={(e) => {
            e.preventDefault();
            setOpen(true);
          }}
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
};

export default InfoTip;
