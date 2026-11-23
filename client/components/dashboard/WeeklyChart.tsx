"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import { axisTicks } from "@/lib/dashboard/chart";
import { WeeklyCount } from "@/lib/types";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { useState } from "react";

interface WeeklyChartProps {
  weeks: WeeklyCount[];
}

const WeeklyChart = ({ weeks }: WeeklyChartProps) => {
  const [openWeek, setOpenWeek] = useState<string | null>(null);

  const ticks = axisTicks(Math.max(...weeks.map((week) => week.count), 0));
  const top = ticks[ticks.length - 1];
  const percent = (count: number) => `${(count / top) * 100}%`;

  return (
    <div>
      <div className="flex h-52 gap-3 pt-2">
        <div className="relative w-5 text-right text-xs tabular-nums text-muted-foreground" aria-hidden>
          {ticks.map((tick) => (
            <span key={tick} className="absolute right-0 translate-y-1/2" style={{ bottom: percent(tick) }}>
              {tick}
            </span>
          ))}
        </div>

        <div className="relative flex-1">
          {ticks.map((tick) => (
            <div
              key={tick}
              className="absolute inset-x-0 border-t border-border"
              style={{ bottom: percent(tick) }}
              aria-hidden
            />
          ))}
          <ul className="absolute inset-0 flex">
            {weeks.map(({ week_start, count }, index) => {
              const week = format(parseISO(week_start), "MMM d");
              const jobs = `${count} ${count === 1 ? "job" : "jobs"}`;
              const isCurrent = index === weeks.length - 1;

              return (
                <li key={week_start} className="flex-1">
                  <Tooltip
                    open={openWeek === week_start}
                    onOpenChange={(open) =>
                      setOpenWeek((current) => (open ? week_start : current === week_start ? null : current))
                    }
                  >
                    <TooltipTrigger
                      asChild
                      // Radix closes on click, which leaves touch with no way in. Preventing that lets a tap open it.
                      onClick={(event) => {
                        event.preventDefault();
                        setOpenWeek(week_start);
                      }}
                    >
                      <button
                        type="button"
                        aria-label={`Week of ${week}: ${jobs}`}
                        className="group flex h-full w-full items-end justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span
                          className={cn(
                            "block w-3/5 max-w-6 rounded-t transition-[filter] group-hover:brightness-90 group-focus-visible:brightness-90",
                            isCurrent ? "bg-[#d4940a]" : "bg-candido"
                          )}
                          style={{ height: percent(count) }}
                        />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <span className="font-semibold">{jobs}</span> · {isCurrent ? "This week" : `Week of ${week}`}
                    </TooltipContent>
                  </Tooltip>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="mt-2 flex pl-8 text-xs text-muted-foreground" aria-hidden>
        {weeks.map(({ week_start }, index) => (
          <span key={week_start} className="flex-1 whitespace-nowrap text-center">
            {/* Every third week, counting back from the current one, so labels have room. */}
            {(weeks.length - 1 - index) % 3 === 0 && (
              <span className="inline-block -mx-4">{format(parseISO(week_start), "MMM d")}</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
};

export default WeeklyChart;
