"use client";

import { uploadCVJobBoardEntry } from "@/api/resources/jobBoardEntries/uploadCVJobBoardEntry";
import { getFileUpload } from "@/api/resources/uploads/getFileUpload";
import ConfirmationModal from "@/components/common/ConfirmationModal";
import { Button } from "@/components/ui/Button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/DropdownMenu";
import { Textarea } from "@/components/ui/Textarea";
import { cvSlotState, entryWithCopy, entryWithUpload } from "@/lib/jobBoard/cvSlot";
import { FIT_LABELS, FIT_STYLES } from "@/lib/resume/reviewPanel";
import { JobBoardEntry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ChevronDownIcon, ClipboardTypeIcon, CopyIcon, FileTextIcon, UploadIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { ChangeEvent, ReactNode, useRef, useState } from "react";
import toast from "react-hot-toast";
import UseCvDialog from "./UseCvDialog";

interface CvSlotProps {
  entry: JobBoardEntry;
  onUpdateEntry: (entry: JobBoardEntry) => void;
  /** Wraps actions that open the picker or navigate away (e.g. a discard-changes prompt). */
  beforeLeave?: (action: () => void) => void;
}

type FillWay = "upload" | "paste" | "use";

const runNow = (action: () => void) => action();

/** The job's one CV: an uploaded file, pasted text, or a copy of one of the user's CVs. */
const CvSlot = ({ entry, onUpdateEntry, beforeLeave = runNow }: CvSlotProps) => {
  const router = useRouter();
  const state = cvSlotState(entry);

  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: "replace" | "remove"; run: () => void } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const save = async (text?: string, file?: File, success?: string) => {
    setSaving(true);
    try {
      const response = await uploadCVJobBoardEntry(entry.id, text, file);
      onUpdateEntry(entryWithUpload(entry, response.job_board_entry));
      setDraft(null);
      if (success) toast.success(success);
    } catch (error) {
      console.error(error);
      toast.error("Couldn't save the CV. Try again.");
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
    void save(undefined, file, "CV uploaded");
  };

  const fill = (way: FillWay) => {
    if (way === "upload") fileInput.current?.click();
    else if (way === "paste") setDraft("");
    else beforeLeave(() => setPickerOpen(true));
  };

  // Replacing an upload or text deletes it, so ask first; a copy is kept, so don't.
  const replaceWith = (way: FillWay) => {
    if (state === "file" || state === "text") setConfirm({ kind: "replace", run: () => fill(way) });
    else fill(way);
  };

  const remove = () => {
    if (state === "copy") void save();
    else setConfirm({ kind: "remove", run: () => void save() });
  };

  const viewFile = async () => {
    if (!entry.cv_key) return;
    try {
      const blob = await getFileUpload(entry.cv_key);
      const url = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
      if (!window.open(url, "_blank")) {
        const a = document.createElement("a");
        a.href = url;
        a.download = entry.cv_filename ?? "cv.pdf";
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      console.error(error);
      toast.error("Couldn't open the file.");
    }
  };

  const replaceMenu = (ways: FillWay[]) => (
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
          placeholder="Paste the CV you sent"
          className="max-h-80 min-h-32"
          disabled={saving}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setDraft(null)} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void save(draft, undefined, "CV saved")}
            disabled={saving || !draft.trim()}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    );
  } else if (state === "empty") {
    body = (
      <div className="flex flex-wrap gap-2">
        {(["upload", "paste", "use"] as const).map((way) => (
          <Button key={way} type="button" variant="outline" size="sm" onClick={() => fill(way)} disabled={saving}>
            {FILL_ICONS[way]}
            {FILL_LABELS[way]}
          </Button>
        ))}
      </div>
    );
  } else if (state === "copy" && entry.cv_curriculum) {
    const copy = entry.cv_curriculum;
    body = (
      <SlotCard>
        <div className="flex min-w-0 items-start justify-between gap-3">
          <p className="min-w-0 truncate text-sm font-medium">{copy.title}</p>
          {copy.fit && (
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                FIT_STYLES[copy.fit]
              )}
            >
              <i className="size-1.5 rounded-full" aria-hidden />
              {FIT_LABELS[copy.fit]} fit
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Edited {formatDistanceToNow(new Date(copy.updated_at), { addSuffix: true })}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              onClick={() => beforeLeave(() => router.push(`/resume/${copy.id}`))}
              disabled={saving}
            >
              Open
            </Button>
            {replaceMenu(["upload", "paste", "use"])}
            {removeButton}
          </div>
        </div>
      </SlotCard>
    );
  } else {
    const isFile = state === "file";
    body = (
      <SlotCard>
        <div className="flex min-w-0 items-center gap-2">
          <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
          <p className="min-w-0 truncate text-sm font-medium">
            {isFile ? entry.cv_filename ?? "CV.pdf" : "Pasted text"}
          </p>
        </div>
        {!isFile && (
          <p className="mt-1 line-clamp-2 text-xs whitespace-pre-line text-muted-foreground">{entry.cv_text}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5">
          {isFile ? (
            <Button type="button" variant="outline" size="sm" onClick={() => void viewFile()} disabled={saving}>
              View
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => setDraft(entry.cv_text ?? "")} disabled={saving}>
              Edit
            </Button>
          )}
          {replaceMenu(isFile ? ["upload", "paste", "use"] : ["upload", "use"])}
          {removeButton}
        </div>
      </SlotCard>
    );
  }

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">CV</h3>
      {body}

      <input ref={fileInput} type="file" accept="application/pdf" className="hidden" onChange={handleFile} />

      <UseCvDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        entry={entry}
        onCreated={(result) => onUpdateEntry(entryWithCopy(entry, result.curriculum))}
      />

      <ConfirmationModal
        isOpen={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm?.run()}
        title={confirm?.kind === "remove" ? "Remove the uploaded CV?" : "Replace the uploaded CV?"}
        description="The current file is deleted."
        confirmLabel={confirm?.kind === "remove" ? "Remove" : "Replace"}
        variant="destructive"
      />
    </section>
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

const SlotCard = ({ children }: { children: ReactNode }) => (
  <div className="rounded-md border border-border p-3">{children}</div>
);

export default CvSlot;
