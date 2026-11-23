"use client";

import { Button } from "@/components/ui/Button";
import { closesLabel } from "@/lib/dashboard/chart";
import { postingUrl, Readiness } from "@/lib/jobBoard/readiness";
import { JobBoardEntry } from "@/lib/types";
import { ExternalLinkIcon } from "lucide-react";
import { useState } from "react";

const STATUS: Record<Exclude<Readiness["state"], "suggestions">, string> = {
  no_cv: "Choose a CV to send",
  not_reviewed: "Your CV isn't tailored yet",
  reviewing: "Reviewing your CV…",
  failed: "The review didn't finish",
  ready: "Ready to apply",
};

const quiet = "border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white";

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
    <div className="sticky bottom-0 z-10 flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-candido-black px-4 py-3 text-white sm:px-6">
      {asking ? (
        <>
          <p role="status" className="text-sm">
            Did you apply to {entry.company}?
          </p>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" className={quiet} onClick={() => setAsking(false)}>
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
            <span className="font-medium text-candido">{status}</span>
            {entry.closing_date && (
              <span className="text-white/70">. {closesLabel(new Date(entry.closing_date).toISOString())}.</span>
            )}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={isReady && !url ? "candido" : "outline"}
              className={isReady && !url ? undefined : quiet}
              onClick={onApplied}
            >
              Mark as applied
            </Button>
            {url && (
              <Button asChild size="sm" variant={isReady ? "candido" : "outline"} className={isReady ? undefined : quiet}>
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
