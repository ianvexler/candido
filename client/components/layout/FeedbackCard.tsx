import Link from "next/link";
import { MessageSquareTextIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** The feedback link at the foot of the sidebar: a card when open, just its icon when collapsed. */
const FeedbackCard = ({ collapsed }: { collapsed: boolean }) => (
  <Link
    href="/feedback"
    aria-label={collapsed ? "Send feedback" : undefined}
    title={collapsed ? "Send feedback" : undefined}
    className={cn(
      "group flex items-center gap-3 rounded-lg border transition-colors duration-200",
      collapsed
        ? "border-transparent"
        : "border-white/10 bg-white/[0.03] hover:border-candido/40 hover:bg-white/5"
    )}
  >
    <span
      className="flex size-10 shrink-0 items-center justify-center rounded-md bg-candido/15 text-candido transition-colors group-hover:bg-candido/25"
      aria-hidden
    >
      <MessageSquareTextIcon className="size-4.5" strokeWidth={1.75} />
    </span>
    <span className={cn("whitespace-nowrap py-1.5 pr-3 transition-opacity duration-200", collapsed && "opacity-0")}>
      <span className="block text-sm font-medium text-white">Spotted a problem?</span>
      <span className="block text-[13px] text-gray-300 group-hover:text-candido">Send feedback</span>
    </span>
  </Link>
);

export default FeedbackCard;
