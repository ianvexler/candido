import { PIPELINE_STATUSES } from "@/lib/dashboard/chart";
import { JobCounts } from "@/lib/jobBoard/useJobCounts";

// Stages still in play; rejected jobs would swamp the bar.
const STAGES = PIPELINE_STATUSES.filter(({ key }) => key !== "rejected");

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** A thin bar of where your jobs stand, under the job search links. */
const JobsPipeline = ({ counts }: { counts: JobCounts }) => {
  const total = STAGES.reduce((sum, { key }) => sum + counts[key], 0);
  if (total === 0) return null;

  const offers = counts.offered + counts.accepted;
  const summary = [
    counts.interview > 0 && plural(counts.interview, "interview"),
    offers > 0 && plural(offers, "offer"),
  ].filter(Boolean);

  return (
    <div className="w-54 px-2.5 pt-2 pb-1">
      <div
        className="flex h-1.5 gap-px overflow-hidden rounded-full"
        role="img"
        aria-label={STAGES.filter(({ key }) => counts[key] > 0)
          .map(({ key, label }) => `${counts[key]} ${label.toLowerCase()}`)
          .join(", ")}
      >
        {STAGES.filter(({ key }) => counts[key] > 0).map(({ key, color }) => (
          <span key={key} style={{ flexGrow: counts[key], backgroundColor: color }} />
        ))}
      </div>
      {summary.length > 0 && (
        <p className="mt-1.5 whitespace-nowrap font-mono text-xs text-gray-400">{summary.join(" · ")}</p>
      )}
    </div>
  );
};

export default JobsPipeline;
