"use client";

import { Button } from "@/components/ui/Button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/Sheet";
import { PaletteIcon } from "lucide-react";
import CvDesignPanel, { CvDesignPanelProps } from "./CvDesignPanel";

/** A button for a CV's design, over the CV where there is no panel beside it. */
const DesignSheet = (props: CvDesignPanelProps) => (
  <Sheet>
    <SheetTrigger asChild>
      <Button variant="ghost" size="sm">
        <PaletteIcon />
        Design
      </Button>
    </SheetTrigger>
    <SheetContent
      aria-describedby={undefined}
      className="w-[min(22rem,100vw)] gap-0"
      onEscapeKeyDown={(event) => {
        // That gives up the name being written.
        if (props.designName !== null && event.target instanceof Element && event.target.closest("form")) event.preventDefault();
      }}
    >
      <SheetTitle className="shrink-0 border-b border-border px-5 py-3.5 text-sm">Design</SheetTitle>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <CvDesignPanel {...props} />
      </div>
    </SheetContent>
  </Sheet>
);

export default DesignSheet;
