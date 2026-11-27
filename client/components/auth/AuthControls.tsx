import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { ComponentProps } from "react";

/** The large black call to action on the sign in and sign up pages. */
export const authCtaClass = "h-12 w-full rounded-lg text-[16px] font-semibold hover:bg-black";

interface AuthLinkProps extends ComponentProps<typeof Link> {
  /** Off while a form is sending, so the user can't leave mid-request. */
  disabled?: boolean;
}

/** An inline text link with the amber underline, e.g. "Create an account". */
export const AuthLink = ({ disabled, className, ...props }: AuthLinkProps) => (
  <Link
    aria-disabled={disabled || undefined}
    tabIndex={disabled ? -1 : undefined}
    className={cn(
      "font-semibold text-candido-black underline decoration-[var(--landing-amber)] decoration-2 underline-offset-4 hover:decoration-candido-black",
      disabled && "pointer-events-none opacity-50",
      className
    )}
    {...props}
  />
);

interface AuthSubmitProps {
  loading: boolean;
  label: string;
  loadingLabel: string;
}

/** The form's submit button, with an arrow that nudges on hover. */
export const AuthSubmit = ({ loading, label, loadingLabel }: AuthSubmitProps) => (
  <Button type="submit" disabled={loading} className={cn("group mt-3", authCtaClass)}>
    {loading ? (
      loadingLabel
    ) : (
      <>
        {label}
        <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
      </>
    )}
  </Button>
);
