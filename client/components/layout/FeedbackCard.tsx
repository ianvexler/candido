import Link from "next/link";
import { MessageSquareTextIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";

/** The feedback link, as a small card at the foot of the sidebar; just its icon tile on the rail. */
const FeedbackCard = ({ collapsed }: { collapsed: boolean }) => (
  <Tooltip open={collapsed ? undefined : false}>
    <TooltipTrigger asChild>
      <Link
        href="/feedback"
        className="group relative flex items-center gap-3 overflow-hidden rounded-lg border border-white/10 bg-white/[0.03] p-2.5 transition-[padding,background-color,border-color] duration-200 ease-out hover:border-candido/40 hover:bg-white/5 sidebar-collapsed:p-[calc(0.375rem-1px)]"
      >
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-md bg-candido/15 text-candido transition-colors group-hover:bg-candido/25"
          aria-hidden
        >
          <MessageSquareTextIcon className="size-4.5" strokeWidth={1.75} />
        </span>
        {/* Out of the flow on the rail, so the card shrinks to a square tile. */}
        <span className="min-w-0 whitespace-nowrap transition-opacity duration-150 sidebar-collapsed:absolute sidebar-collapsed:opacity-0">
          <span className="block text-sm font-medium text-white">Spotted a problem?</span>
          <span className="block text-[13px] text-gray-300 group-hover:text-candido">Send feedback</span>
        </span>
      </Link>
    </TooltipTrigger>
    <TooltipContent side="right" sideOffset={14}>
      Send feedback
    </TooltipContent>
  </Tooltip>
);

export default FeedbackCard;
