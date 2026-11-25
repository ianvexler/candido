"use client";

import { Button } from "@/components/ui/Button";
import Segmented from "@/components/ui/Segmented";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import { ListChecksIcon, PaletteIcon, SparklesIcon } from "lucide-react";
import { ReactNode, useState } from "react";
import type { CvLook } from "@/lib/resume/cvDesign";
import FitMeter from "./FitMeter";
import PagedCv, { PagedCvProps } from "./PagedCv";
import PagePanel from "./PagePanel";
import { PagePanels, shownPanels, toggleChecklist, togglePanel } from "./pagePanels";
import type { PagePaging } from "./usePaging";

const ZOOMS = [
  { value: "fit", label: "Fit" },
  { value: "full", label: "100%" },
] as const;

// Below this there is room for one panel beside the sheet.
const WIDE = "(min-width: 1280px)";

type PageViewProps = Omit<PagedCvProps, "zoom" | "onPaging" | "readOnly" | keyof CvLook> &
  CvLook & {
    onDesignChange: (design: CvLook["design"]) => void;
    onPaperChange: (paper: CvLook["paper"]) => void;
    /** A design being named; see DesignPanel. */
    designName: string | null;
    onDesignNameChange: (name: string | null) => void;
    checklist: ReactNode;
    review?: ReactNode;
    /** Over the sheets. */
    notice: ReactNode;
    /** Under the sheets. */
    children: ReactNode;
  };

/** A CV edited on its page, between what it includes and how it looks. */
const PageView = ({
  onDesignChange,
  onPaperChange,
  designName,
  onDesignNameChange,
  checklist,
  review,
  notice,
  children,
  ...page
}: PageViewProps) => {
  const wide = useMediaQuery(WIDE);
  const [report, setReport] = useState<PagePaging | null>(null);
  const [zoom, setZoom] = useState<PagedCvProps["zoom"]>("fit");
  const [panels, setPanels] = useState<PagePanels>({ checklist: null, panel: null, front: "checklist" });
  const shown = shownPanels(panels, wide);

  const toggle = (active: boolean) => ({
    variant: "ghost" as const,
    size: "sm" as const,
    "aria-expanded": active,
    className: cn(active && "bg-[#fff6e2] hover:bg-[#fff6e2]"),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        role="group"
        aria-label="Page tools"
        className="flex h-11 shrink-0 items-center gap-3 border-b border-border bg-background px-4"
      >
        <Button {...toggle(shown.checklist)} onClick={() => setPanels(toggleChecklist(panels, wide))}>
          <ListChecksIcon />
          What to include
        </Button>
        <div className="flex min-w-0 flex-1 justify-center">
          <FitMeter report={report} />
        </div>
        <Segmented label="Zoom" options={ZOOMS} value={zoom} onChange={setZoom} />
        {review !== undefined && (
          <Button {...toggle(shown.panel === "review")} onClick={() => setPanels(togglePanel(panels, wide, "review"))}>
            <SparklesIcon />
            Review
          </Button>
        )}
        <Button {...toggle(shown.panel === "design")} onClick={() => setPanels(togglePanel(panels, wide, "design"))}>
          <PaletteIcon />
          Design
        </Button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Hidden rather than unmounted, so that reopening keeps the search. */}
        <aside
          aria-label="What to include"
          hidden={!shown.checklist}
          className="w-80 shrink-0 overflow-y-auto border-r border-border bg-background"
        >
          {checklist}
        </aside>
        <div
          className="min-w-0 flex-1 overflow-auto bg-[#e4e7ea] px-12 py-8 [scrollbar-gutter:stable]"
        >
          {notice && <div className="pb-6">{notice}</div>}
          <PagedCv {...page} zoom={zoom} onPaging={setReport} />
          <div className="mx-auto max-w-md pt-6 pb-10">{children}</div>
        </div>
        <PagePanel
          tab={shown.panel}
          onTabChange={(panel) => setPanels({ ...panels, panel })}
          review={review}
          design={page.design}
          paper={page.paper}
          onDesignChange={onDesignChange}
          onPaperChange={onPaperChange}
          designName={designName}
          onDesignNameChange={onDesignNameChange}
        />
      </div>
    </div>
  );
};

export default PageView;
