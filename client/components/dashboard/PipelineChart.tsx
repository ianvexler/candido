"use client";

import Link from "next/link";
import { donutSegments, PIPELINE_STATUSES } from "@/lib/dashboard/chart";
import { JobBoardEntriesStats } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useState } from "react";

const SIZE = 180;
const STROKE = 24;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface PipelineChartProps {
  counts: JobBoardEntriesStats["counts"];
}

const PipelineChart = ({ counts }: PipelineChartProps) => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const values = PIPELINE_STATUSES.map(({ key }) => counts[key]);
  const total = values.reduce((sum, value) => sum + value, 0);
  const active = activeIndex === null ? null : PIPELINE_STATUSES[activeIndex];

  return (
    <div className="flex h-full flex-col items-center gap-6 sm:flex-row sm:gap-8">
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        {/* The list beside it carries every value, so the ring is decoration to a screen reader. */}
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90" aria-hidden>
          {total === 0 && (
            <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" strokeWidth={STROKE} className="stroke-muted" />
          )}
          {donutSegments(values, CIRCUMFERENCE, 2).map(({ index, start, length }) => (
            <circle
              key={PIPELINE_STATUSES[index].key}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke={PIPELINE_STATUSES[index].color}
              strokeWidth={STROKE}
              strokeDasharray={`${length} ${CIRCUMFERENCE - length}`}
              strokeDashoffset={-start}
              className={cn(
                "transition-opacity",
                activeIndex !== null && activeIndex !== index && "opacity-30"
              )}
              pointerEvents="stroke"
              onMouseEnter={() => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-semibold tracking-tight">
            {activeIndex === null ? total : values[activeIndex]}
          </span>
          <span className="text-xs text-muted-foreground">
            {active ? `${active.label} · ${Math.round((values[activeIndex!] / (total || 1)) * 100)}%` : total === 1 ? "job" : "jobs"}
          </span>
        </div>
      </div>

      <ul className="w-full flex-1 text-sm">
        {PIPELINE_STATUSES.map(({ key, label, color }, index) => {
          const row = (
            <>
              <span className="size-3 shrink-0 rounded-sm" style={{ backgroundColor: color }} aria-hidden />
              <span className="text-muted-foreground">{label}</span>
              <span className="ml-auto font-medium tabular-nums">{values[index]}</span>
            </>
          );
          const className = cn(
            "flex items-center gap-2.5 rounded-md px-2 py-1 transition-colors",
            activeIndex === index && "bg-muted"
          );

          return (
            <li
              key={key}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
              onFocus={() => setActiveIndex(index)}
              onBlur={() => setActiveIndex(null)}
            >
              <Link href="/board" className={className}>
                {row}
              </Link>
            </li>
          );
        })}
        {counts.rejected > 0 && (
          <li className="mt-2 border-t border-border px-2 pt-2 text-xs text-muted-foreground">
            {counts.rejected} rejected · not shown
          </li>
        )}
      </ul>
    </div>
  );
};

export default PipelineChart;
