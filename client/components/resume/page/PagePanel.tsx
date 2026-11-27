"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { ReactNode } from "react";
import CvDesignPanel, { CvDesignPanelProps } from "../CvDesignPanel";

export type PagePanelTab = "design" | "review";

interface PagePanelProps {
  /** Null while closed. */
  tab: PagePanelTab | null;
  onTabChange: (tab: PagePanelTab) => void;
  review?: ReactNode;
  design: CvDesignPanelProps;
}

/** How a CV looks and, for a tailored one, its review. */
const PagePanel = ({
  tab,
  onTabChange,
  review,
  design,
}: PagePanelProps) => {
  const designTab = (
    <div className="px-5 py-5">
      {review === undefined && <h2 className="mb-4 text-sm font-semibold">Design</h2>}
      <CvDesignPanel {...design} />
    </div>
  );

  // Hidden rather than unmounted, so reopening keeps the saved designs.
  return (
    <aside
      aria-label={tab === "review" ? "Review" : "Design"}
      hidden={tab === null}
      className="w-80 shrink-0 overflow-y-auto border-l border-border bg-background"
    >
      {review === undefined ? (
        designTab
      ) : (
        <Tabs value={tab ?? "design"} onValueChange={(next) => onTabChange(next as PagePanelTab)} className="min-h-full gap-0">
          <div className="sticky top-0 z-10 border-b border-border bg-background px-5 py-2.5">
            <TabsList>
              <TabsTrigger value="design" className="px-3">Design</TabsTrigger>
              <TabsTrigger value="review" className="px-3">Review</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent forceMount value="design" className="data-[state=inactive]:hidden">
            {designTab}
          </TabsContent>
          <TabsContent forceMount value="review" className="flex flex-col data-[state=inactive]:hidden">
            {review}
          </TabsContent>
        </Tabs>
      )}
    </aside>
  );
};

export default PagePanel;
