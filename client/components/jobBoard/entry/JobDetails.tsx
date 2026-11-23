"use client";

import { Button } from "@/components/ui/Button";
import { postingUrl } from "@/lib/jobBoard/readiness";
import { JobBoardEntry } from "@/lib/types";
import { TextStyleKit } from "@tiptap/extension-text-style";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { format } from "date-fns";
import { ReactNode, useState } from "react";
import { cn } from "@/lib/utils";
import JobPanel from "./JobPanel";

const Detail = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="min-w-0">
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="text-sm break-words">{children}</dd>
  </div>
);

/** The saved description, read-only. Parsed by the editor, so its HTML never runs. Key it by its text. */
const Description = ({ html }: { html: string }) => {
  const [open, setOpen] = useState(false);
  const editor = useEditor({
    extensions: [TextStyleKit, StarterKit],
    editable: false,
    immediatelyRender: false,
    content: html,
  });

  return (
    <div className="min-w-0 space-y-1 border-t border-border pt-4">
      <h3 className="text-xs text-muted-foreground">Description</h3>
      <EditorContent
        editor={editor}
        className={cn(
          "overflow-hidden text-sm break-words [&_a]:underline [&_li]:mt-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p+p]:mt-2 [&_ul]:list-disc [&_ul]:pl-5",
          !open && "max-h-36"
        )}
      />
      {html.length > 300 && (
        <Button type="button" variant="link" size="sm" className="px-0" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? "Show less" : "Show all"}
        </Button>
      )}
    </div>
  );
};

/** The job's facts, with a way to edit them. */
const JobDetails = ({ entry, onEdit, loading }: { entry: JobBoardEntry; onEdit: () => void; loading: boolean }) => {
  const url = postingUrl(entry.url);
  const hasDescription = Boolean(entry.description?.replace(/<[^>]*>/g, "").trim());

  return (
    <JobPanel
      title="Job details"
      aside={
        <Button type="button" variant="outline" size="sm" onClick={onEdit} disabled={loading}>
          Edit
        </Button>
      }
    >
      <dl className="space-y-3">
        <Detail label="Location">{entry.location || "—"}</Detail>
        <Detail label="Salary">{entry.salary || "—"}</Detail>
        <Detail label="Closing date">{entry.closing_date ? format(new Date(entry.closing_date), "d MMM yyyy") : "—"}</Detail>
        <Detail label="Posting">
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
              {new URL(url).hostname.replace(/^www\./, "")}
            </a>
          ) : (
            entry.url || "—"
          )}
        </Detail>
        {entry.job_board_tags?.length > 0 && (
          <Detail label="Tags">{entry.job_board_tags.map((tag) => tag.name).join(", ")}</Detail>
        )}
      </dl>
      {hasDescription ? (
        <Description key={entry.description} html={entry.description} />
      ) : (
        <p className="border-t border-border pt-4 text-sm text-muted-foreground">
          Add the description from the posting. Reviews compare your CV with it.
        </p>
      )}
    </JobPanel>
  );
};

export default JobDetails;
