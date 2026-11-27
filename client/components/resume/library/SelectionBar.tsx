"use client";

import type { LabelTarget } from "@/api/resources/cvLabels/setLabelOnItems";
import { Button } from "@/components/ui/Button";
import type { PurposeFilter } from "@/lib/resume/purposes";
import { CvLabel } from "@/lib/types";
import { useState } from "react";
import LabelPicker from "./LabelPicker";

type OnLabel = (labelId: number, on: boolean, targets: LabelTarget[]) => Promise<void>;

/** The selected items that are still in the section, as targets; all of them without `present`. */
export const selectionTargets = (
  sectionId: number,
  selected: ReadonlySet<string>,
  present?: ReadonlySet<string>
): LabelTarget[] =>
  [...selected].filter((id) => !present || present.has(id)).map((id) => ({ section_template_id: sectionId, id }));

export const labelSelection = (
  sectionId: number,
  selected: ReadonlySet<string>,
  onLabel: OnLabel,
  labelId: number,
  on: boolean
) => onLabel(labelId, on, selectionTargets(sectionId, selected));

interface SelectionBarProps {
  sectionId: number;
  /** Item ids, all still in the section. */
  selected: ReadonlySet<string>;
  labels: CvLabel[];
  filter: PurposeFilter;
  onLabel: OnLabel;
  onCreate: (name: string) => Promise<CvLabel>;
  onClear: () => void;
}

/** Labels the selected items together. Stays at the bottom of the section column. */
const SelectionBar = ({ sectionId, selected, labels, filter, onLabel, onCreate, onClear }: SelectionBarProps) => {
  const [open, setOpen] = useState<"add" | "remove" | null>(null);
  const label = (labelId: number, on: boolean) => labelSelection(sectionId, selected, onLabel, labelId, on);
  const picker = (kind: "add" | "remove", text: string) => (
    <LabelPicker
      labels={labels}
      filter={filter}
      mode={{ kind }}
      onChoose={label}
      onCreate={kind === "add" ? onCreate : undefined}
      open={open === kind}
      onOpenChange={(next) => setOpen(next ? kind : null)}
      title={text}
      side="top"
      align="start"
    >
      <Button type="button" variant="outline" size="sm" disabled={kind === "remove" && labels.length === 0}>
        {text}
      </Button>
    </LabelPicker>
  );

  return (
    <div
      role="region"
      aria-label="Selection"
      className="sticky bottom-4 z-20 mx-auto flex w-full max-w-2xl flex-wrap items-center gap-2 rounded-lg border bg-background px-3 py-2 shadow-lg"
    >
      <span role="status" className="mr-auto text-sm font-medium">
        {selected.size} selected
      </span>
      {picker("add", "Add to collection")}
      {picker("remove", "Remove from collection")}
      <Button type="button" variant="ghost" size="sm" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
};

export default SelectionBar;
