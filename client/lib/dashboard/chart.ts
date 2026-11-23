import { differenceInCalendarDays } from "date-fns";
import { JobBoardEntriesStats } from "@/lib/types";

type StatusKey = Exclude<keyof JobBoardEntriesStats["counts"], "total">;

// The board's status colors, stepped so neighboring segments stay distinguishable
// with color-vision deficiencies. Keep this order: it is the order that was checked.
export const PIPELINE_STATUSES: { key: StatusKey; label: string; color: string }[] = [
  { key: "pending", label: "Pending", color: "#94a3b8" },
  { key: "applied", label: "Applied", color: "#d4940a" },
  { key: "assessment", label: "Assessment", color: "#0891b2" },
  { key: "interview", label: "Interview", color: "#6366f1" },
  { key: "offered", label: "Offered", color: "#059669" },
  { key: "accepted", label: "Accepted", color: "#84cc16" },
  { key: "rejected", label: "Rejected", color: "#ef4444" },
];

/** The top of the axis and its ticks: whole numbers only, at most four steps above zero. */
export const axisTicks = (max: number): number[] => {
  const steps = [1, 2, 5];
  let step = 1;
  for (let i = 0; step * 4 < max; i++) {
    step = steps[i % 3] * 10 ** Math.floor(i / 3);
  }
  const count = Math.max(1, Math.ceil(max / step));
  return Array.from({ length: count + 1 }, (_, i) => i * step);
};

export type DonutSegment = { index: number; start: number; length: number };

/** Splits a ring of the given circumference by value, skipping zeros. */
export const donutSegments = (values: number[], circumference: number, gap: number): DonutSegment[] => {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total === 0) return [];

  const visible = values.filter((value) => value > 0).length;
  const usedGap = visible > 1 ? gap : 0;
  let start = 0;
  return values.flatMap((value, index) => {
    if (value <= 0) return [];
    const slot = (value / total) * circumference;
    const segment = { index, start, length: Math.max(slot - usedGap, 1) };
    start += slot;
    return [segment];
  });
};

export const closingLabel = (closingDate: string, now = new Date()): string => {
  const days = differenceInCalendarDays(new Date(closingDate), now);
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
};
