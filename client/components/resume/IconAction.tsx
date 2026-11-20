"use client";

import { Button } from "@/components/ui/Button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import { ComponentProps, ReactNode, Ref } from "react";

interface IconActionProps extends Omit<ComponentProps<"button">, "ref"> {
  /** Shown as the tooltip and used as the accessible name. */
  label: string;
  children: ReactNode;
  active?: boolean;
  side?: "top" | "right" | "bottom" | "left";
  buttonRef?: Ref<HTMLButtonElement>;
}

/** A small icon button explained by a tooltip. */
const IconAction = ({ label, children, active, side = "top", buttonRef, className, ...props }: IconActionProps) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        ref={buttonRef}
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        aria-pressed={active}
        className={cn("text-muted-foreground hover:text-foreground", active && "bg-muted text-foreground", className)}
        {...props}
      >
        {children}
      </Button>
    </TooltipTrigger>
    <TooltipContent side={side}>{label}</TooltipContent>
  </Tooltip>
);

export default IconAction;
