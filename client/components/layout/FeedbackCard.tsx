import Image from "next/image";
import Link from "next/link";
import CraneHook from "@/lib/images/CraneHook.png";

/** The feedback link, as a small card with the crane hook from the landing page. */
const FeedbackCard = () => (
  <Link
    href="/feedback"
    className="group relative block overflow-hidden rounded-lg border border-white/10 bg-white/[0.03] p-3 pr-14 transition-colors hover:border-candido/40 hover:bg-white/5"
  >
    <Image
      src={CraneHook}
      alt=""
      width={44}
      height={44}
      className="absolute -top-1 right-2 transition-transform duration-300 group-hover:translate-y-1"
    />
    <p className="text-sm font-medium text-white">Spotted a problem?</p>
    <p className="mt-0.5 text-xs text-gray-400 group-hover:text-candido">Send feedback</p>
  </Link>
);

export default FeedbackCard;
