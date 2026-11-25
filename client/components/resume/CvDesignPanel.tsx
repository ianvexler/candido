"use client";

import Segmented from "@/components/ui/Segmented";
import type { CvLook } from "@/lib/resume/cvDesign";
import { PaperSizes } from "@/lib/types";
import DesignPanel from "./DesignPanel";

const PAPER_LABEL = { a4: "A4", letter: "Letter" };
const PAPERS = PaperSizes.map((value) => ({ value, label: PAPER_LABEL[value] }));

export interface CvDesignPanelProps extends CvLook {
  onDesignChange: (design: CvLook["design"]) => void;
  onPaperChange: (paper: CvLook["paper"]) => void;
  /** A design being named; see DesignPanel. */
  designName: string | null;
  onDesignNameChange: (name: string | null) => void;
}

/** A CV's paper and design. */
const CvDesignPanel = ({ design, paper, onDesignChange, onPaperChange, designName, onDesignNameChange }: CvDesignPanelProps) => (
  <>
    <div className="mb-5 flex items-center justify-between gap-3 text-sm">
      <span className="font-medium">Paper</span>
      <Segmented label="Paper size" options={PAPERS} value={paper} onChange={onPaperChange} />
    </div>
    <DesignPanel design={design} onChange={onDesignChange} newName={designName} onNewNameChange={onDesignNameChange} />
  </>
);

export default CvDesignPanel;
