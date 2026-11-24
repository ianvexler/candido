"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

export type CvTab = "include" | "cv" | "review";

interface CvWorkspaceProps {
  header: ReactNode;
  checklist: ReactNode;
  /** The CV's papers. */
  children: ReactNode;
  review?: ReactNode;
  /** What shows when there's no room for all. */
  tab: CvTab;
  onTabChange: (tab: CvTab) => void;
}

// Panels stay mounted and laid out, so they keep their edits and scroll. Three
// columns need more room than two.
const LAYOUTS = {
  two: {
    tabs: "lg:hidden",
    panels: "lg:flex",
    panel: "max-lg:absolute max-lg:inset-0 max-lg:data-[state=inactive]:invisible",
    checklist: "lg:w-[390px] lg:flex-none lg:border-r",
    review: "",
  },
  three: {
    tabs: "xl:hidden",
    panels: "xl:flex",
    panel: "max-xl:absolute max-xl:inset-0 max-xl:data-[state=inactive]:invisible",
    checklist: "xl:w-[390px] xl:flex-none xl:border-r",
    review: "xl:min-w-80 xl:flex-[0_1_448px] xl:border-l",
  },
};

/** What to include, the CV and its review: side by side, or as tabs on a small screen. */
const CvWorkspace = ({ header, checklist, children, review, tab, onTabChange }: CvWorkspaceProps) => {
  const hasReview = review !== undefined;
  const layout = hasReview ? LAYOUTS.three : LAYOUTS.two;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-border px-6 py-5">{header}</header>

      <Tabs
        value={tab}
        onValueChange={(next) => onTabChange(next as CvTab)}
        className="min-h-0 flex-1 gap-0"
      >
        <div className={cn("shrink-0 border-b border-border px-5 py-2.5", layout.tabs)}>
          <TabsList>
            <TabsTrigger value="include" className="px-3">Include</TabsTrigger>
            <TabsTrigger value="cv" className="px-3">CV</TabsTrigger>
            {hasReview && <TabsTrigger value="review" className="px-3">Review</TabsTrigger>}
          </TabsList>
        </div>

        <div className={cn("relative min-h-0 flex-1", layout.panels)}>
          <TabsContent
            forceMount
            value="include"
            className={cn("overflow-y-auto border-border bg-background", layout.panel, layout.checklist)}
          >
            {checklist}
          </TabsContent>
          <TabsContent
            forceMount
            value="cv"
            className={cn("min-w-0 overflow-y-auto bg-muted/50 px-4 py-8 sm:px-8", layout.panel, hasReview && "xl:min-w-[26rem]")}
          >
            <div className="space-y-8 pb-16">{children}</div>
          </TabsContent>
          {hasReview && (
            <TabsContent
              forceMount
              value="review"
              className={cn("overflow-x-hidden overflow-y-auto border-border bg-background", layout.panel, layout.review)}
            >
              {review}
            </TabsContent>
          )}
        </div>
      </Tabs>
    </div>
  );
};

export default CvWorkspace;
