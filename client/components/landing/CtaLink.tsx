import { cn } from "@/lib/utils";
import Link from "next/link";
import { ComponentProps } from "react";

/** The landing page's solid call-to-action. */
const CtaLink = ({ className, ...props }: ComponentProps<typeof Link>) => (
  <Link
    className={cn(
      "inline-flex min-h-12 items-center justify-center rounded-lg bg-candido-black px-6 text-[17px] font-semibold text-white transition-colors hover:bg-black",
      className
    )}
    {...props}
  />
);

export default CtaLink;
