import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { ComponentProps } from "react";

interface AuthFieldProps extends ComponentProps<typeof Input> {
  id: string;
  label: string;
}

/** A labelled input sized for the sign in and sign up forms. */
const AuthField = ({ id, label, className, ...props }: AuthFieldProps) => (
  <div className="space-y-2">
    <Label htmlFor={id} className="text-[14px] font-semibold">
      {label}
    </Label>
    <Input
      id={id}
      className={`h-11 rounded-lg border-neutral-300 bg-white px-3.5 text-[15px] md:text-[15px] focus-visible:border-candido-black focus-visible:ring-[var(--landing-amber)]/60 ${className ?? ""}`}
      {...props}
    />
  </div>
);

export default AuthField;
