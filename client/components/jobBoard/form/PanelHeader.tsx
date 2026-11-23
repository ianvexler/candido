import InlineInput from "@/components/ui/InlineInput";
import { JobFieldValues } from "@/lib/jobBoard/jobFields";
import { SetJobField } from "@/lib/jobBoard/useJobFields";
import { jobStatusColors } from "@/lib/types";
import { cn } from "@/lib/utils";
import { XIcon } from "lucide-react";
import { ReactNode } from "react";

interface PanelHeaderProps {
  fields: JobFieldValues;
  setField: SetJobField;
  disabled: boolean;
  showErrors: boolean;
  onClose: () => void;
  /** Beside the close button. */
  children?: ReactNode;
}

/** The top of a job's side panel: its title and the way out. */
const PanelHeader = ({ fields, setField, disabled, showErrors, onClose, children }: PanelHeaderProps) => {
  const invalid = showErrors && !fields.title.trim();

  return (
    <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border bg-muted/30 px-6 py-5">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-3 pt-1">
          <div className={cn("size-5 shrink-0 rounded-sm", jobStatusColors[fields.status])} title={fields.status.toLowerCase()} />
          <InlineInput
            id="title"
            autoComplete="off"
            aria-label="Job title"
            aria-invalid={invalid || undefined}
            value={fields.title}
            onChange={(event) => setField("title", event.target.value)}
            disabled={disabled}
            placeholder="Job title..."
            className={cn("border-b-0 text-2xl font-semibold tracking-tight", invalid && "border-b-2! border-red-500!")}
          />
        </div>
        {invalid && <p className="ml-8 text-xs text-red-500">Title is required</p>}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {children}
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Close"
        >
          <XIcon className="size-5" />
        </button>
      </div>
    </div>
  );
};

export default PanelHeader;
