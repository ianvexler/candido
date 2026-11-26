import { JobAutosave } from "@/lib/jobBoard/useJobAutosave";
import { cn } from "@/lib/utils";

const LABELS = { saving: "Saving…", saved: "Saved", failed: "Not saved", incomplete: "Needs a title and company" } as const;

const SaveStatus = ({ status }: Pick<JobAutosave, "status">) => (
  <span role="status" className={cn("shrink-0 text-xs", status === "failed" || status === "incomplete" ? "text-destructive" : "text-muted-foreground")}>
    {status && LABELS[status]}
  </span>
);

export default SaveStatus;
