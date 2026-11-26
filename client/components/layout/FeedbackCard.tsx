import Link from "next/link";
import { MessageSquareTextIcon } from "lucide-react";

/** The feedback link, as a small card at the foot of the sidebar. */
const FeedbackCard = () => (
  <Link
    href="/feedback"
    className="group flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-2.5 transition-colors hover:border-candido/40 hover:bg-white/5"
  >
    <span
      className="flex size-8 shrink-0 items-center justify-center rounded-md bg-candido/15 text-candido transition-colors group-hover:bg-candido/25"
      aria-hidden
    >
      <MessageSquareTextIcon className="size-4.5" strokeWidth={1.75} />
    </span>
    <span className="min-w-0">
      <span className="block text-sm font-medium text-white">Spotted a problem?</span>
      <span className="block text-[13px] text-gray-300 group-hover:text-candido">Send feedback</span>
    </span>
  </Link>
);

export default FeedbackCard;
