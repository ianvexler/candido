"use client";

import { uploadCVJobBoardEntry } from "@/api/resources/jobBoardEntries/uploadCVJobBoardEntry";
import { uploadCoverLetterJobBoardEntry } from "@/api/resources/jobBoardEntries/uploadCoverLetterJobBoardEntry";
import { getFileUpload } from "@/api/resources/uploads/getFileUpload";
import ConfirmationModal from "@/components/common/ConfirmationModal";
import FitBadge from "@/components/common/FitBadge";
import { Button } from "@/components/ui/Button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/DropdownMenu";
import { Textarea } from "@/components/ui/Textarea";
import {
  afterCopyCreated,
  coverLetterSlotState,
  CvSlotState,
  cvSlotState,
  entryWithCoverLetter,
  entryWithUpload,
} from "@/lib/jobBoard/cvSlot";
import { JobBoardEntry } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";
import { ChevronDownIcon, ClipboardTypeIcon, CopyIcon, FileTextIcon, UploadIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { ChangeEvent, ReactNode, useRef, useState } from "react";
import toast from "react-hot-toast";
import UseCvDialog from "./UseCvDialog";

export type DocKind = "cv" | "cover_letter";

interface DocSlotProps {
  kind: DocKind;
  entry: JobBoardEntry;
  onUpdateEntry: (entry: JobBoardEntry) => void;
  /** Wraps actions that navigate away (e.g. a discard-changes prompt). */
  beforeLeave?: (action: () => void) => void;
}

type FillWay = "upload" | "paste" | "use";

interface KindConfig {
  /** Sentence start, e.g. in toasts. */
  name: string;
  /** Mid-sentence. */
  noun: string;
  ways: FillWay[];
  placeholder: string;
  fallbackFilename: string;
  state: (entry: JobBoardEntry) => CvSlotState;
  doc: (entry: JobBoardEntry) => { key?: string; text?: string; filename?: string };
  save: (entry: JobBoardEntry, text?: string, file?: File) => Promise<(latest: JobBoardEntry) => JobBoardEntry>;
}

const KINDS: Record<DocKind, KindConfig> = {
  cv: {
    name: "CV",
    noun: "CV",
    ways: ["upload", "paste", "use"],
    placeholder: "Paste the CV you sent",
    fallbackFilename: "cv.pdf",
    state: cvSlotState,
    doc: (e) => ({ key: e.cv_key, text: e.cv_text, filename: e.cv_filename }),
    save: async (entry, text, file) => {
      const { job_board_entry } = await uploadCVJobBoardEntry(entry.id, text, file);
      return (latest) => entryWithUpload(latest, job_board_entry);
    },
  },
  cover_letter: {
    name: "Cover letter",
    noun: "cover letter",
    ways: ["upload", "paste"],
    placeholder: "Paste the cover letter you sent",
    fallbackFilename: "cover-letter.pdf",
    state: coverLetterSlotState,
    doc: (e) => ({ key: e.cover_letter_key, text: e.cover_letter_text, filename: e.cover_letter_filename }),
    save: async (entry, text, file) => {
      const { job_board_entry } = await uploadCoverLetterJobBoardEntry(entry.id, text, file);
      return (latest) => entryWithCoverLetter(latest, job_board_entry);
    },
  },
};

const runNow = (action: () => void) => action();

/**
 * One of the job's documents: an uploaded file or pasted text, and for the CV
 * also a copy of one of the user's CVs. Has no heading; the page around it names it.
 */
const DocSlot = ({ kind, entry, onUpdateEntry, beforeLeave = runNow }: DocSlotProps) => {
  const router = useRouter();
  const config = KINDS[kind];
  const state = config.state(entry);
  const doc = config.doc(entry);

  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: "replace" | "remove"; run: () => void } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // Responses can arrive after the entry changed; merge onto the latest one, not the one at call time.
  const latestEntry = useRef(entry);
  latestEntry.current = entry;
  // Same for the leave wrapper: the sheet's save reads the latest fields and entry.
  const latestBeforeLeave = useRef(beforeLeave);
  latestBeforeLeave.current = beforeLeave;

  const save = async (text?: string, file?: File, success?: string) => {
    setSaving(true);
    try {
      const merge = await config.save(entry, text, file);
      onUpdateEntry(merge(latestEntry.current));
      setDraft(null);
      if (success) toast.success(success);
    } catch (error) {
      console.error(error);
      toast.error(`Couldn't save the ${config.noun}. Try again.`);
    } finally {
      setSaving(false);
    }
  };

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error("Please upload a PDF file.");
      return;
    }
    void save(undefined, file, `${config.name} uploaded`);
  };

  const fill = (way: FillWay) => {
    if (way === "upload") fileInput.current?.click();
    else if (way === "paste") setDraft("");
    else setPickerOpen(true);
  };

  // Replacing an upload or text deletes it, so ask first; a copy is kept, so don't.
  // Pasting over a file asks on Save instead, since the paste box can still be cancelled.
  const replaceWith = (way: FillWay) => {
    if ((state === "file" || state === "text") && way !== "paste") setConfirm({ kind: "replace", run: () => fill(way) });
    else fill(way);
  };

  const saveDraft = (text: string) => {
    const run = () => void save(text, undefined, `${config.name} saved`);
    if (state === "file") setConfirm({ kind: "replace", run });
    else run();
  };

  const remove = () => {
    if (state === "copy") void save();
    else setConfirm({ kind: "remove", run: () => void save() });
  };

  const viewFile = async () => {
    if (!doc.key) return;
    try {
      const blob = await getFileUpload(doc.key);
      const url = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
      if (!window.open(url, "_blank")) {
        const a = document.createElement("a");
        a.href = url;
        a.download = doc.filename ?? config.fallbackFilename;
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      console.error(error);
      toast.error("Couldn't open the file.");
    }
  };

  const replaceControl = (ways: FillWay[]) =>
    ways.length === 1 ? (
      <Button type="button" variant="outline" size="sm" onClick={() => replaceWith(ways[0])} disabled={saving}>
        Replace
      </Button>
    ) : (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" disabled={saving}>
            Replace
            <ChevronDownIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {ways.map((way) => (
            <DropdownMenuItem key={way} onSelect={() => replaceWith(way)}>
              {FILL_ICONS[way]}
              {FILL_LABELS[way]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );

  const removeButton = (
    <Button type="button" variant="ghost" size="sm" onClick={remove} disabled={saving}>
      Remove
    </Button>
  );

  let body: ReactNode;
  if (draft !== null) {
    body = (
      <div className="space-y-2">
        <Textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={config.placeholder}
          aria-label={config.name}
          className="max-h-80 min-h-32"
          disabled={saving}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setDraft(null)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={() => saveDraft(draft)} disabled={saving || !draft.trim()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    );
  } else if (state === "empty") {
    body = (
      <div className="flex flex-col items-start gap-3 rounded-md border border-dashed border-border p-4">
        <p className="text-sm text-muted-foreground">No {config.noun} added yet.</p>
        <div className="flex flex-wrap gap-2">
          {config.ways.map((way) => (
            <Button key={way} type="button" variant="outline" size="sm" onClick={() => fill(way)} disabled={saving}>
              {FILL_ICONS[way]}
              {FILL_LABELS[way]}
            </Button>
          ))}
        </div>
      </div>
    );
  } else if (state === "copy" && entry.cv_curriculum) {
    const copy = entry.cv_curriculum;
    body = (
      <SlotCard
        icon={<CopyIcon />}
        title={copy.title}
        badge={copy.fit && <FitBadge fit={copy.fit} />}
        detail={`Edited ${formatDistanceToNow(new Date(copy.updated_at), { addSuffix: true })}`}
        actions={
          <>
            <Button
              type="button"
              size="sm"
              onClick={() => beforeLeave(() => router.push(`/resume/${copy.id}`))}
              disabled={saving}
            >
              Open
            </Button>
            {replaceControl(config.ways)}
            {removeButton}
          </>
        }
      />
    );
  } else {
    const isFile = state === "file";
    body = (
      <SlotCard
        icon={isFile ? <FileTextIcon /> : <ClipboardTypeIcon />}
        title={isFile ? doc.filename ?? config.fallbackFilename : "Pasted text"}
        detail={isFile ? "PDF" : undefined}
        preview={isFile ? undefined : doc.text}
        actions={
          <>
            {isFile ? (
              <Button type="button" size="sm" onClick={() => void viewFile()} disabled={saving}>
                View
              </Button>
            ) : (
              <Button type="button" size="sm" onClick={() => setDraft(doc.text ?? "")} disabled={saving}>
                Edit
              </Button>
            )}
            {replaceControl(isFile ? config.ways : config.ways.filter((way) => way !== "paste"))}
            {removeButton}
          </>
        }
      />
    );
  }

  const what = state === "text" ? `pasted ${config.noun}` : `uploaded ${config.noun}`;

  return (
    <div className="space-y-2">
      {body}

      <input ref={fileInput} type="file" accept="application/pdf" className="hidden" onChange={handleFile} />

      {kind === "cv" && (
        <UseCvDialog
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          entry={entry}
          onCreated={(result) =>
            afterCopyCreated({
              entry: latestEntry.current,
              copy: result.curriculum,
              onUpdateEntry,
              beforeLeave: latestBeforeLeave.current,
              navigate: (href) => router.push(href),
            })
          }
        />
      )}

      <ConfirmationModal
        isOpen={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm?.run()}
        title={`${confirm?.kind === "remove" ? "Remove" : "Replace"} the ${what}?`}
        description={state === "text" ? "The current text is deleted." : "The current file is deleted."}
        confirmLabel={confirm?.kind === "remove" ? "Remove" : "Replace"}
        variant="destructive"
      />
    </div>
  );
};

const FILL_LABELS: Record<FillWay, string> = {
  upload: "Upload file",
  paste: "Paste text",
  use: "Use one of my CVs",
};

const FILL_ICONS: Record<FillWay, ReactNode> = {
  upload: <UploadIcon />,
  paste: <ClipboardTypeIcon />,
  use: <CopyIcon />,
};

/** A filled slot: what it holds on the left, its badge on the right, actions below. */
const SlotCard = ({
  icon,
  title,
  badge,
  detail,
  preview,
  actions,
}: {
  icon: ReactNode;
  title: string;
  badge?: ReactNode;
  detail?: string;
  preview?: string;
  actions: ReactNode;
}) => (
  <div className="rounded-md border border-border p-3">
    <div className="flex min-w-0 items-start gap-2.5">
      <span className="mt-0.5 shrink-0 text-muted-foreground [&>svg]:size-4" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <p className="min-w-0 truncate text-sm font-medium">{title}</p>
          {badge}
        </div>
        {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
        {preview && <p className="mt-1 line-clamp-2 text-xs whitespace-pre-line text-muted-foreground">{preview}</p>}
      </div>
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-end gap-1.5">{actions}</div>
  </div>
);

export default DocSlot;
