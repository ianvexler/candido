import { FIT_LABELS, FIT_STYLES } from "@/lib/resume/reviewPanel";
import { CvTailoringReport } from "@/lib/types";
import { cn } from "@/lib/utils";

/** How well a CV fits its job, as the review judged it. */
const FitBadge = ({ fit, className }: { fit: CvTailoringReport["fit"]; className?: string }) => (
  <span
    className={cn(
      "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
      FIT_STYLES[fit],
      className
    )}
  >
    <i className="size-1.5 rounded-full" aria-hidden />
    {FIT_LABELS[fit]} fit
  </span>
);

export default FitBadge;
