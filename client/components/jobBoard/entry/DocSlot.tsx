"use client";

import { getFileUpload } from "@/api/resources/uploads/getFileUpload";
import ConfirmationModal from "@/components/common/ConfirmationModal";
import { Button } from "@/components/ui/Button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/DropdownMenu";
import { Textarea } from "@/components/ui/Textarea";
import {
  afterCopyCreated,
  DOC_KINDS,
  DocKind,
  EntryPatch,
  FillWay,
  replaceWays,
  saveDocument,
  textPreview,
} from "@/lib/jobBoard/docSlot";
import { JobBoardEntry, JobStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ChevronDownIcon, ClipboardTypeIcon, CopyIcon, FileTextIcon, SparklesIcon, UploadIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { ChangeEvent, ReactNode, useRef, useState } from "react";
import toast from "react-hot-toast";
import UseCvDialog from "./UseCvDialog";

interface DocSlotProps {
  kind: DocKind;
  entry: JobBoardEntry;
  /** Applies a change to the job with this id; changes name only the fields they set. */
  onPatchEntry: (id: number, patch: EntryPatch) => void;
  /** Wraps actions that navigate away (e.g. a discard-changes prompt). */
  beforeLeave?: (action: () => void) => void;
}

const runNow = (action: () => void) => action();

/**
 * One of the job's documents: an uploaded file or pasted text, and for the CV
 * also a copy of one of the user's CVs. Has no heading; the page around it names it.
 * Its parent must remount it for another job (key it by the job's id), so a paste box
 * or prompt never carries over.
 */
const DocSlot = ({ kind, entry, onPatchEntry, beforeLeave = runNow }: DocSlotProps) => {
  const router = useRouter();
  const config = DOC_KINDS[kind];
  const state = config.state(entry);
  const doc = config.doc(entry);

  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: "replace" | "remove"; description?: string; run: () => void } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // The leave wrapper changes as the sheet's fields change: the sheet's save reads the latest fields and entry.
  const latestBeforeLeave = useRef(beforeLeave);
  latestBeforeLeave.current = beforeLeave;

  const save = async (text?: string, file?: File, success?: string) => {
    setSaving(true);
    try {
      // Sends only this document's fields, for this job, so a late response can't undo anything else.
      onPatchEntry(entry.id, await saveDocument(kind, entry.id, text, file));
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
    if (file) takeFile(file);
  };

  const takeFile = (file: File) => {
    if (file.type !== "application/pdf") {
      toast.error("Please upload a PDF file.");
      return;
    }
    const run = () => void save(undefined, file, `${config.name} uploaded`);
    // Ask only now that a file was picked: cancelling the picker deletes nothing.
    if (state !== "empty") setConfirm({ kind: "replace", run });
    else run();
  };

  const fill = (way: FillWay) => {
    if (way === "upload") fileInput.current?.click();
    else if (way === "paste") setDraft("");
    else setPickerOpen(true);
  };

  // Replacing what's in the slot deletes it (a copy too: it only existed for this job), so ask.
  // Uploads and pastes ask once there's something to replace it with. Picking one of your CVs
  // makes the copy straight away, so that asks before the picker opens.
  const replaceWith = (way: FillWay) => {
    if (state !== "empty" && way === "use") {
      setConfirm({
        kind: "replace",
        description:
          state === "copy"
            ? "Picking one of your CVs makes a new copy and deletes this one from your CVs."
            : `Picking one of your CVs deletes the current ${state === "text" ? "text" : "file"}.`,
        run: () => fill(way),
      });
    } else fill(way);
  };

  const saveDraft = (text: string) => {
    const run = () => void save(text, undefined, `${config.name} saved`);
    if (state === "file" || state === "copy") setConfirm({ kind: "replace", run });
    else run();
  };

  const remove = () => setConfirm({ kind: "remove", run: () => void save() });

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
  } else if (state === "empty" && kind === "cv" && entry.status === JobStatus.PENDING) {
    // Not applied yet, so preparing a CV comes before filing one that was sent.
    body = (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Make a copy of one of your CVs for this job, and get edits that help it fit. Your original isn&apos;t changed.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="candido" onClick={() => fill("use")} disabled={saving}>
            {FILL_ICONS.use}
            {FILL_LABELS.use}
          </Button>
          {config.ways
            .filter((way) => way !== "use")
            .map((way) => (
              <Button
                key={way}
                type="button"
                variant="ghost"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => fill(way)}
                disabled={saving}
              >
                {FILL_ICONS[way]}
                {saving && way === "upload" ? "Uploading…" : FILL_LABELS[way]}
              </Button>
            ))}
        </div>
      </div>
    );
  } else if (state === "empty") {
    // The dashed area is the drop target and the main action; the other ways sit under it.
    body = (
      <div className="space-y-1.5">
        <button
          type="button"
          onClick={() => {
            if (!saving) fill("upload");
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(!saving);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files[0];
            if (file && !saving) takeFile(file);
          }}
          // Not `disabled`: it would stop handling drops, and the browser would open the file instead.
          aria-disabled={saving}
          className={cn(
            "group flex w-full items-center gap-3 rounded-md border border-dashed border-muted-foreground/30 px-4 py-3.5 text-left transition-colors",
            "hover:border-muted-foreground/60 hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
            "aria-disabled:cursor-default aria-disabled:opacity-60",
            dragging && "border-primary bg-muted/60"
          )}
        >
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-hover:text-foreground [&>svg]:size-4"
            aria-hidden
          >
            <UploadIcon />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium">
              {saving ? "Uploading…" : entry.status === JobStatus.PENDING ? `Upload your ${config.noun}` : `Upload the ${config.noun} you sent`}
            </span>
            <span className="block text-xs text-muted-foreground">Drop a PDF here, or click to choose one</span>
          </span>
        </button>
        {/* Pulled left by the buttons' own padding so their icons line up with the box. */}
        <div className="-ml-2.5 flex flex-wrap gap-1">
          {config.ways
            .filter((way) => way !== "upload")
            .map((way) => (
              <Button
                key={way}
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => fill(way)}
                disabled={saving}
              >
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
        detail={`Edited ${formatDistanceToNow(new Date(copy.updated_at), { addSuffix: true })}`}
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => beforeLeave(() => router.push(`/resume/${copy.id}`))}
              disabled={saving}
            >
              Open
            </Button>
            {replaceControl(replaceWays(kind, state))}
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
        preview={isFile ? undefined : textPreview(doc.text)}
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
            {replaceControl(replaceWays(kind, state))}
            {removeButton}
          </>
        }
      />
    );
  }

  const what = state === "copy" ? "CV copy" : state === "text" ? `pasted ${config.noun}` : `uploaded ${config.noun}`;
  const deletes = {
    copy: "The copy is deleted from your CVs, along with its review. Your original CV isn't changed.",
    text: "The current text is deleted.",
    file: "The current file is deleted.",
    empty: "",
  }[state];

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
              entryId: entry.id,
              copy: result.curriculum,
              onPatchEntry,
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
        description={confirm?.description ?? deletes}
        confirmLabel={confirm?.kind === "remove" ? "Remove" : "Replace"}
        variant="destructive"
      />
    </div>
  );
};

const FILL_LABELS: Record<FillWay, string> = {
  upload: "Upload file",
  paste: "Paste text",
  use: "Tailor one of my CVs",
};

const FILL_ICONS: Record<FillWay, ReactNode> = {
  upload: <UploadIcon />,
  paste: <ClipboardTypeIcon />,
  use: <SparklesIcon />,
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
          <p className="min-w-0 truncate text-sm font-medium" title={title}>
            {title}
          </p>
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
