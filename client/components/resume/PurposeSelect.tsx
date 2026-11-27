"use client";

import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import { CvLabel } from "@/lib/types";

// A select item can't have an empty value.
const EVERYTHING = "all";

interface PurposeSelectProps {
  labels: CvLabel[];
  /** Null for Everything. */
  value: number | null;
  onChange: (labelId: number | null) => void;
  disabled?: boolean;
}

/** What a CV is for. */
const PurposeSelect = ({ labels, value, onChange, disabled }: PurposeSelectProps) => (
  <Select
    value={value === null ? EVERYTHING : String(value)}
    onValueChange={(next) => onChange(next === EVERYTHING ? null : Number(next))}
    disabled={disabled}
  >
    <SelectTrigger aria-label="Collection" size="sm" className="max-w-48">
      <SelectValue />
    </SelectTrigger>
    <SelectContent position="popper">
      <SelectGroup>
        <SelectItem value={EVERYTHING}>All content</SelectItem>
        {labels.map((label) => (
          <SelectItem key={label.id} value={String(label.id)}>
            {label.name}
          </SelectItem>
        ))}
      </SelectGroup>
    </SelectContent>
  </Select>
);

export default PurposeSelect;
