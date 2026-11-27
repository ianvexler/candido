"use client";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { ArrowLeftIcon } from "lucide-react";
import { ReactNode } from "react";

interface LibraryWorkspaceProps {
  header: ReactNode;
  /** Purposes and the outline. */
  side: ReactNode;
  /** The chosen section. */
  children: ReactNode;
  /** Below 1024px: the section shows instead of the side. */
  detailOpen: boolean;
  onBack: () => void;
}

// Both stay mounted and laid out, so they keep their edits and scroll.
const PANEL = "max-lg:absolute max-lg:inset-0 max-lg:data-[open=false]:invisible";

/** Purposes and outline beside one section, or as a list screen and a detail screen when narrow. */
const LibraryWorkspace = ({ header, side, children, detailOpen, onBack }: LibraryWorkspaceProps) => (
  <div className="flex min-h-0 flex-1 flex-col">
    <header className="shrink-0 border-b border-border px-6 py-5">{header}</header>

    <div className="relative min-h-0 flex-1 lg:flex">
      <aside
        data-open={!detailOpen}
        aria-label="Purposes and outline"
        className={cn("overflow-y-auto border-border bg-background lg:w-80 lg:flex-none lg:border-r", PANEL)}
      >
        {side}
      </aside>
      <main
        data-open={detailOpen}
        className={cn("min-w-0 overflow-y-auto bg-muted/50 px-4 pb-8 sm:px-8 lg:flex-1 lg:pt-8", PANEL)}
      >
        <div className="sticky top-0 z-10 -mx-4 mb-4 border-b border-border bg-background/95 px-4 py-2 backdrop-blur sm:-mx-8 sm:px-8 lg:hidden">
          <Button type="button" variant="ghost" size="sm" className="-ml-2.5" onClick={onBack}>
            <ArrowLeftIcon />
            Back
          </Button>
        </div>
        <div className="space-y-8 pb-16">{children}</div>
      </main>
    </div>
  </div>
);

export default LibraryWorkspace;
