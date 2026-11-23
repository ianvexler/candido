"use client";

import { Button } from "@/components/ui/Button";
import { closesLabel } from "@/lib/dashboard/chart";
import { postingUrl, Readiness } from "@/lib/jobBoard/readiness";
import { JobBoardEntry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ExternalLinkIcon } from "lucide-react";
import { useState } from "react";

const STATUS: Record<Exclude<Readiness["state"], "suggestions">, string> = {
  no_cv: "Choose a CV to send",
  not_reviewed: "Your CV isn't tailored yet",
  reviewing: "Reviewing your CV…",
  failed: "The review didn't finish",
  ready: "Ready to apply",
};

interface ApplyBarProps {
  entry: JobBoardEntry;
  readiness: Readiness;
  onApplied: () => void;
}

/** Where the application stands, and sending it. Nothing here waits for the CV to be ready. */
const ApplyBar = ({ entry, readiness, onApplied }: ApplyBarProps) => {
  const [asking, setAsking] = useState(false);
  const url = postingUrl(entry.url);
  const isReady = readiness.state === "ready";
  const status = readiness.state === "suggestions" ? `${readiness.label} to review` : STATUS[readiness.state];

  return (
    <div className="sticky bottom-0 z-10 flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border bg-neutral-200 px-4 py-3 sm:px-6 min-[90rem]:px-14 min-[106rem]:px-20">
      {asking ? (
        <>
          <p role="status" className="text-sm">
            Did you apply to {entry.company}?
          </p>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setAsking(false)}>
              Not yet
            </Button>
            <Button type="button" size="sm" variant="candido" onClick={onApplied}>
              Yes, I applied
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm">
            <span
              className={cn("mr-2 inline-block size-2 rounded-full", isReady ? "bg-emerald-600" : "bg-amber-500")}
              aria-hidden
            />
            <span className="font-medium">{status}</span>
            {entry.closing_date && (
              <span className="text-neutral-600">. {closesLabel(new Date(entry.closing_date).toISOString())}.</span>
            )}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={isReady && !url ? "candido" : "outline"}
              onClick={onApplied}
            >
              Mark as applied
            </Button>
            {url && (
              <Button asChild size="sm" variant={isReady ? "candido" : "outline"}>
                <a href={url} target="_blank" rel="noopener noreferrer" onClick={() => setAsking(true)}>
                  <ExternalLinkIcon />
                  Open posting
                </a>
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ApplyBar;
