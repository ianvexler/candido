/** Borderless inputs that read as document text until hovered or focused. */
export const ghostInput =
  "min-w-0 rounded-sm bg-transparent outline-none placeholder:text-muted-foreground/60 hover:bg-muted/50 focus:bg-muted/60 px-1 -mx-1 transition-colors";

/** Reaches into the paper's margin, so a "Leave out" button has room beside the text. */
export const LEAVE_OUT_SPACE = "-mr-7 pr-[44px] sm:-mr-10 sm:pr-[68px]";

export const LEAVE_OUT_BUTTON =
  "absolute right-0 w-[40px] rounded-md bg-muted px-0.5 py-0.5 text-center text-[12px] leading-tight [overflow-wrap:normal] text-foreground hover:bg-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:w-auto sm:px-1.5 sm:whitespace-nowrap [@media(pointer:coarse)]:min-h-[44px]";
