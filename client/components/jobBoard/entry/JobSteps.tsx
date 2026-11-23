import { Readiness } from "@/lib/jobBoard/readiness";
import { cn } from "@/lib/utils";
import { CheckIcon } from "lucide-react";

type Step = { label: string; detail: string; state: "done" | "current" | "todo" };

const steps = (readiness: Readiness, hasCoverLetter: boolean): Step[] => {
  const cvReady = readiness.state === "ready";
  return [
    { label: "Job saved", detail: "Done", state: "done" },
    { label: "Tailor CV", detail: readiness.label, state: cvReady ? "done" : "current" },
    { label: "Cover letter", detail: hasCoverLetter ? "Added" : "Optional", state: hasCoverLetter ? "done" : "todo" },
    { label: "Apply", detail: cvReady ? "Ready when you are" : "Any time", state: cvReady ? "current" : "todo" },
  ];
};

/** Where an application stands before it's sent. Progress only: nothing here blocks applying. */
const JobSteps = ({ readiness, hasCoverLetter }: { readiness: Readiness; hasCoverLetter: boolean }) => (
  <ol aria-label="Application steps" className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4">
    {steps(readiness, hasCoverLetter).map(({ label, detail, state }) => (
      <li
        key={label}
        aria-current={state === "current" ? "step" : undefined}
        className={cn(
          "border-t-4 pt-2",
          state === "done" && "border-emerald-500",
          state === "current" && "border-candido",
          state === "todo" && "border-border"
        )}
      >
        <p className={cn("flex items-center gap-1 text-sm font-medium", state === "todo" && "text-muted-foreground")}>
          {state === "done" && <CheckIcon className="size-3.5 text-emerald-700" aria-label="Done:" role="img" />}
          {label}
        </p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </li>
    ))}
  </ol>
);

export default JobSteps;
