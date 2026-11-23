"use client";

import { Button } from "@/components/ui/Button";
import { postingUrl } from "@/lib/jobBoard/readiness";
import { JobBoardEntry } from "@/lib/types";
import { ExternalLinkIcon } from "lucide-react";
import { useState } from "react";
import JobPanel from "./JobPanel";

interface JobApplyProps {
  entry: JobBoardEntry;
  /** The CV is ready, so applying is the next thing to do. */
  isNext: boolean;
  saving: boolean;
  onApplied: () => void;
}

/** Opens the posting, then asks whether the application was sent. */
const JobApply = ({ entry, isNext, saving, onApplied }: JobApplyProps) => {
  const [asking, setAsking] = useState(false);
  const url = postingUrl(entry.url);

  return (
    <JobPanel title="Apply">
      {asking ? (
        <div role="status" className="flex flex-wrap items-center gap-2">
          <p className="mr-auto text-sm">Did you apply to {entry.company}?</p>
          <Button type="button" variant="outline" size="sm" onClick={() => setAsking(false)} disabled={saving}>
            Not yet
          </Button>
          <Button type="button" size="sm" onClick={onApplied} disabled={saving}>
            {saving ? "Saving…" : "Yes, I applied"}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {url && (
            <Button asChild variant={isNext ? "candido" : "outline"}>
              <a href={url} target="_blank" rel="noopener noreferrer" onClick={() => setAsking(true)}>
                <ExternalLinkIcon />
                Open posting
              </a>
            </Button>
          )}
          <Button type="button" variant={url ? "ghost" : isNext ? "candido" : "outline"} onClick={onApplied} disabled={saving}>
            {saving ? "Saving…" : "Mark as applied"}
          </Button>
        </div>
      )}
    </JobPanel>
  );
};

export default JobApply;
