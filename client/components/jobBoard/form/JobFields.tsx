import "@/components/richEditor/styles.scss";
import SimpleMenuBar from "@/components/richEditor/simpleEditor/SimpleMenuBar";
import { Button } from "@/components/ui/Button";
import InlineInput from "@/components/ui/InlineInput";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import { JobFieldValues } from "@/lib/jobBoard/jobFields";
import { postingUrl } from "@/lib/jobBoard/readiness";
import { closingLabel } from "@/lib/jobBoard/sentLog";
import { SetJobField } from "@/lib/jobBoard/useJobFields";
import { JobBoardEntry, JobStatus, jobStatusColors } from "@/lib/types";
import { capitalize, cn } from "@/lib/utils";
import { Editor, EditorContent } from "@tiptap/react";
import { parseISO } from "date-fns";
import { ArrowUpRightIcon } from "lucide-react";
import { ReactNode } from "react";
import TagsInput from "../TagsInput";

// The job's fields, edited in place: beside the applications list, in the board's side panel and in
// the form for adding a job, so all three look the same.

// Reads as text until hovered or focused, then shows the underline of a field.
const paneInput = "border-transparent hover:border-border focus:border-foreground";
const paneFieldInput = cn(paneInput, "h-7 py-0 text-sm font-medium");

interface FieldsProps {
  fields: JobFieldValues;
  setField: SetJobField;
  disabled: boolean;
}

/** One of the job's facts. */
const PaneField = ({
  label,
  htmlFor,
  hint,
  wide = false,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string | null;
  /** Spans every column. */
  wide?: boolean;
  className?: string;
  children: ReactNode;
}) => (
  <div className={cn("min-w-0 bg-background px-4 py-2.5", wide && "col-span-full", className)}>
    <label htmlFor={htmlFor} className="block text-xs text-muted-foreground">
      {label}
    </label>
    {children}
    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
  </div>
);

export const PaneSection = ({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) => (
  <section className="mt-7">
    <div className="mb-2.5 flex items-center justify-between gap-2">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</h3>
      {aside}
    </div>
    {children}
  </section>
);

export const StatusPill = ({ fields, setField, disabled }: FieldsProps) => (
  <Select value={fields.status} onValueChange={(status) => setField("status", status as JobStatus)} disabled={disabled}>
    <SelectTrigger size="sm" className="w-auto gap-2 rounded-full bg-background" aria-label="Status">
      <i className={cn("size-2 rounded-full", jobStatusColors[fields.status])} aria-hidden />
      <SelectValue />
    </SelectTrigger>
    <SelectContent position="popper" align="start">
      <SelectGroup>
        {Object.values(JobStatus).map((status) => (
          <SelectItem key={status} value={status}>
            {capitalize(status.toLowerCase())}
          </SelectItem>
        ))}
      </SelectGroup>
    </SelectContent>
  </Select>
);

/** The title and company, with the status and actions on the title's line. */
export const JobHeader = ({
  fields,
  setField,
  disabled,
  invalid,
  showErrors,
  actions,
}: FieldsProps & {
  /** Underlines a missing title or company. */
  invalid: boolean;
  /** Says what's missing. */
  showErrors: boolean;
  actions: ReactNode;
}) => {
  const noTitle = !fields.title.trim();
  const noCompany = !fields.company.trim();

  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        {/* Grows to a second line, so a long title isn't cut off beside the status. */}
        <textarea
          id="title"
          rows={1}
          autoComplete="off"
          value={fields.title}
          // One line of text: no line breaks, typed or pasted.
          onChange={(event) => setField("title", event.target.value.replace(/\s*\n\s*/g, " "))}
          onKeyDown={(event) => event.key === "Enter" && event.preventDefault()}
          disabled={disabled}
          aria-label="Job title"
          aria-invalid={(invalid && noTitle) || undefined}
          placeholder="Job title"
          className={cn(
            "block w-full resize-none rounded-none border-b bg-transparent px-0 outline-none [field-sizing:content] placeholder:text-muted-foreground aria-invalid:border-destructive disabled:opacity-50",
            paneInput,
            "py-0.5 text-2xl font-bold leading-tight tracking-tight"
          )}
        />
        {showErrors && noTitle && <p className="text-xs text-destructive">A job needs a title.</p>}
        <InlineInput
          id="company"
          autoComplete="off"
          value={fields.company}
          onChange={(event) => setField("company", event.target.value)}
          disabled={disabled}
          aria-label="Company"
          aria-invalid={(invalid && noCompany) || undefined}
          placeholder="Company"
          className={cn(paneInput, "mt-0.5 py-0.5 text-muted-foreground focus:text-foreground")}
        />
        {showErrors && noCompany && <p className="text-xs text-destructive">A job needs a company.</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1 pt-0.5">{actions}</div>
    </div>
  );
};

/** Where, how much, until when, the link and the tags, in one box. */
export const JobFacts = ({ fields, setField, disabled, allEntries }: FieldsProps & { allEntries: JobBoardEntry[] }) => {
  const posting = postingUrl(fields.url);
  const closing =
    fields.status === JobStatus.PENDING ? closingLabel(fields.closingDate ? parseISO(fields.closingDate) : null) : null;
  const input = (field: "location" | "salary" | "closingDate" | "url", className?: string) => (
    <InlineInput
      id={field}
      autoComplete="off"
      type={field === "closingDate" ? "date" : undefined}
      value={fields[field]}
      onChange={(event) => setField(field, event.target.value)}
      disabled={disabled}
      placeholder={field === "closingDate" ? undefined : "Add"}
      className={cn(paneFieldInput, className)}
    />
  );

  return (
    <div className="@container mt-5">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border @md:grid-cols-3">
        <PaneField label="Location" htmlFor="location">
          {input("location")}
        </PaneField>
        <PaneField label="Salary" htmlFor="salary">
          {input("salary")}
        </PaneField>
        {/* Beside location and salary when there's room; its own row in a narrow pane. */}
        <PaneField label="Closing date" htmlFor="closingDate" hint={closing} className="col-span-2 @md:col-span-1">
          {input("closingDate")}
        </PaneField>
        <PaneField label="Link" htmlFor="url" wide>
          <div className="flex items-center gap-2">
            {input("url", "min-w-0 flex-1")}
            {/* Only once it's an address a browser can open. */}
            {posting && (
              <Button asChild type="button" variant="outline" size="xs" className="shrink-0">
                <a href={posting} target="_blank" rel="noopener noreferrer" aria-label="Open the link in a new tab">
                  Open
                  <ArrowUpRightIcon />
                </a>
              </Button>
            )}
          </div>
        </PaneField>
        <PaneField label="Tags" wide>
          <TagsInput
            compact
            allEntries={allEntries}
            tags={fields.tags}
            onTagsChange={(tags) => setField("tags", tags)}
            className="mt-1.5 min-h-7 border-transparent py-0.5 text-sm font-medium hover:border-border hover:bg-transparent"
          />
        </PaneField>
      </div>
    </div>
  );
};

export const DescriptionSection = ({ editor }: { editor: Editor | null }) => (
  <PaneSection title="Description">
    <div className="simple-editor-wrapper flex flex-col overflow-hidden rounded-lg border border-border bg-background">
      {editor && <SimpleMenuBar editor={editor} />}
      <EditorContent
        editor={editor}
        // Clicking below the text writes in it too.
        onClick={(event) => event.target === event.currentTarget && editor?.commands.focus("end")}
        className="max-h-80 min-h-28 cursor-text overflow-y-auto leading-relaxed"
      />
    </div>
  </PaneSection>
);
