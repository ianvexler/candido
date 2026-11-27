"use client";

import { fitMessage } from "@/lib/resume/paging";
import { cn } from "@/lib/utils";
import { useState } from "react";
import type { PagePaging } from "./usePaging";

/** How a CV fits its pages. `report` is what PagedCv's onPaging got last. */
const FitMeter = ({ report }: { report: PagePaging | null }) => {
  // Only the count is read out, not each line typed. It stays while a font loads.
  const [announced, setAnnounced] = useState("");
  const pages = report?.paging.pages ?? 1;
  const count = `${pages} ${pages === 1 ? "page" : "pages"}`;
  if (report?.ready && announced !== count) setAnnounced(count);

  // An over-tall page is never more than full.
  const fill = report ? Math.min(1, report.paging.used / report.metrics.pageHeight) : 0;

  return (
    <div className="flex h-9 min-w-0 items-center gap-2.5 text-sm">
      <span role="status" className="sr-only">
        {announced}
      </span>
      {report?.ready && (
        <>
          <span
            aria-hidden
            className={cn(
              "h-2 w-16 shrink-0 overflow-hidden rounded-full border",
              // The message says so too.
              pages > 1 ? "border-foreground/40 bg-candido/25" : "border-border bg-muted"
            )}
          >
            <span
              className={cn("block h-full rounded-full", pages > 1 ? "bg-candido" : "bg-foreground/70")}
              style={{ width: `${fill * 100}%` }}
            />
          </span>
          <span className="truncate text-muted-foreground">
            {fitMessage(report.paging, report.metrics, report.lineHeight, report.exact)}
          </span>
        </>
      )}
    </div>
  );
};

export default FitMeter;
