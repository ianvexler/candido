"use client";

import ConfirmationModal from "@/components/common/ConfirmationModal";
import "@/components/richEditor/styles.scss";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import { SectionFields } from "@/lib/types";
import Link from "@tiptap/extension-link";
import { TextStyleKit } from "@tiptap/extension-text-style";
import { EditorContent, useEditor } from "@tiptap/react";
import { Placeholder } from "@tiptap/extensions";
import StarterKit from "@tiptap/starter-kit";
import { CalendarMinusIcon, CalendarPlusIcon, Trash2Icon } from "lucide-react";
import { ReactNode, Ref, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { BlockToolbar, FormatBubble } from "./EditorControls";
import HiddenMark from "./HiddenMark";
import IconAction from "./IconAction";
import { normalizeContent } from "./documentContent";
import { markPending, markSettled, trackSave } from "@/lib/resume/saveTracker";
import { ghostInput } from "./styles";
import { fromMonthInput, hasDetails, suggestsDetails, toMonthInput } from "./sectionDetails";

const SAVE_DELAY_MS = 600;


interface SectionDocumentProps<T extends SectionFields & { id: number }> {
  section: T;
  /** Persists the fields and resolves with the saved record. */
  save: (fields: SectionFields) => Promise<T>;
  onSaved: (next: T) => void;
  /** Deletes the record. Rejecting keeps the section on screen. */
  onDelete: () => Promise<void>;
  deleteLabel: string;
  deleteTitle: string;
  deleteDescription: string;
  /** Extra icon actions at the top right, shown on hover before the built-in ones. */
  actions?: ReactNode;
  /** Shown in the left margin on hover, e.g. a drag handle. */
  handle?: ReactNode;
  /** Shown above the section, e.g. a "library changed" notice. */
  notice?: ReactNode;
  /** Fades the page, e.g. when the section is hidden from a CV. */
  dimmed?: boolean;
  articleRef?: Ref<HTMLElement>;
  className?: string;
}

/**
 * A paper-style editor for one section. Controls stay out of the way until the
 * section is hovered, focused or text is selected. Edits autosave after a pause.
 * The editor is uncontrolled: remount it (change its key) to load new content.
 */
const SectionDocument = <T extends SectionFields & { id: number }>({
  section,
  save,
  onSaved,
  onDelete,
  deleteLabel,
  deleteTitle,
  deleteDescription,
  actions,
  handle,
  notice,
  dimmed = false,
  articleRef,
  className,
}: SectionDocumentProps<T>) => {
  const [sectionType, setSectionType] = useState(section.section_type);
  const [title, setTitle] = useState(section.title);
  const [description, setDescription] = useState(section.description ?? "");
  const [role, setRole] = useState(section.role ?? "");
  const [organization, setOrganization] = useState(section.organization ?? "");
  const [location, setLocation] = useState(section.location ?? "");
  const [startMonth, setStartMonth] = useState(toMonthInput(section.start_date));
  const [endMonth, setEndMonth] = useState(toMonthInput(section.end_date));
  const [current, setCurrent] = useState(section.current);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Bumped on every edit; a non-zero value means there are unsaved changes.
  const [dirty, setDirty] = useState(0);
  const markDirty = () => setDirty((count) => count + 1);
  const edit = (setter: (value: string) => void) => (event: { target: { value: string } }) => {
    setter(event.target.value);
    markDirty();
  };

  const details = {
    role: role.trim() || null,
    organization: organization.trim() || null,
    location: location.trim() || null,
    start_date: fromMonthInput(startMonth),
    end_date: current ? null : fromMonthInput(endMonth),
    current,
  };
  // "YYYY-MM" strings compare correctly as text.
  const endBeforeStart = !current && Boolean(startMonth && endMonth) && endMonth < startMonth;
  const showDetails = detailsOpen || hasDetails(details) || suggestsDetails(sectionType);

  const clearDetails = () => {
    setRole("");
    setOrganization("");
    setLocation("");
    setStartMonth("");
    setEndMonth("");
    setCurrent(false);
    setDetailsOpen(false);
    markDirty();
  };

  const editor = useEditor({
    extensions: [
      TextStyleKit,
      StarterKit,
      Link.configure({ openOnClick: false }),
      HiddenMark,
      Placeholder.configure({ placeholder: "Write here. Start a line with - for bullets." }),
    ],
    immediatelyRender: false,
    content: section.content || "<p></p>",
    editorProps: {
      attributes: {
        "aria-label": "Section content",
        class:
          "cv-document-editor outline-none min-h-16 [&_span[data-cv-hidden]]:bg-amber-100 [&_span[data-cv-hidden]]:text-amber-900/80 [&_span[data-cv-hidden]]:line-through [&_span[data-cv-hidden]]:rounded-sm [&_span[data-cv-hidden]]:px-0.5",
      },
    },
    onUpdate: markDirty,
  });

  // Export waits on unsaved edits (this key) and on save requests (trackSave).
  const editKey = `section-${section.id}:edit`;

  // Unmounting cancels the debounce, so the edit will never be saved; requests
  // already sent settle on their own.
  useEffect(() => () => markSettled(editKey), [editKey]);

  useEffect(() => {
    if (dirty === 0) {
      markSettled(editKey);
      return;
    }
    markPending(editKey);
    if (!editor) return;

    const timer = setTimeout(() => {
      setDirty(0);
      // Shown inline; the server would reject it anyway.
      if (endBeforeStart) {
        markSettled(editKey);
        return;
      }
      const fields: SectionFields = {
        title: title.trim() || "Untitled",
        section_type: sectionType.trim() || "Section",
        description: description.trim() || null,
        content: normalizeContent(editor.getHTML()),
        role: role.trim() || null,
        organization: organization.trim() || null,
        location: location.trim() || null,
        start_date: fromMonthInput(startMonth),
        end_date: current ? null : fromMonthInput(endMonth),
        current,
      };
      // Editor housekeeping (e.g. its trailing paragraph) can fire updates
      // without any real change; saving those would mark CV copies as stale.
      const unchanged =
        fields.title === section.title &&
        fields.section_type === section.section_type &&
        fields.description === (section.description || null) &&
        fields.content === normalizeContent(section.content) &&
        fields.role === (section.role || null) &&
        fields.organization === (section.organization || null) &&
        fields.location === (section.location || null) &&
        fields.start_date === section.start_date &&
        fields.end_date === section.end_date &&
        fields.current === section.current;
      if (unchanged) {
        markSettled(editKey);
        return;
      }

      const request = trackSave(`section-${section.id}`, save(fields));
      markSettled(editKey);
      void request
        .then(onSaved)
        .catch((error) => {
          console.error(error);
          toast.error(error?.response?.data?.error ?? "Couldn't save this section. Check your connection and try again.");
        });
    }, SAVE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [
    dirty, editor, title, sectionType, description, role, organization, location,
    startMonth, endMonth, current, endBeforeStart, section, save, onSaved, editKey,
  ]);

  const onConfirmDelete = async () => {
    setDirty(0);
    await onDelete();
  };

  return (
    <>
      <article
        ref={articleRef}
        className={cn(
          "group/section relative mx-auto w-full max-w-2xl bg-white px-10 pb-10 pt-9 shadow-[0_1px_3px_rgba(0,0,0,0.08),0_8px_24px_rgba(0,0,0,0.06)] sm:px-14 transition-opacity",
          dimmed && "opacity-55",
          className
        )}
      >
        {handle && (
          <div className="absolute left-2 top-9 opacity-0 transition-opacity group-hover/section:opacity-100 group-focus-within/section:opacity-100 sm:left-4">
            {handle}
          </div>
        )}

        <div className="absolute right-3 top-3 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/section:opacity-100 group-focus-within/section:opacity-100">
          {actions}
          {showDetails && !suggestsDetails(sectionType) ? (
            <IconAction label="Remove role and dates" onClick={clearDetails}>
              <CalendarMinusIcon />
            </IconAction>
          ) : !showDetails ? (
            <IconAction label="Add role and dates" onClick={() => setDetailsOpen(true)}>
              <CalendarPlusIcon />
            </IconAction>
          ) : null}
          <IconAction label={deleteLabel} onClick={() => setDeleteOpen(true)}>
            <Trash2Icon />
          </IconAction>
        </div>

        {notice}

        <input
          value={sectionType}
          onChange={edit(setSectionType)}
          placeholder="Section type, e.g. Experience"
          aria-label="Section type"
          className={cn(ghostInput, "block w-full max-w-[calc(100%-9rem)] py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground placeholder:normal-case placeholder:tracking-normal")}
        />
        <input
          value={title}
          onChange={edit(setTitle)}
          placeholder="Title"
          aria-label="Title"
          className={cn(ghostInput, "mt-1 block w-full py-0.5 text-xl font-semibold")}
        />

        {showDetails && (
          <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-0.5 text-sm">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
              <input
                value={role}
                onChange={edit(setRole)}
                placeholder="Role or degree"
                aria-label="Role or degree"
                className={cn(ghostInput, "field-sizing-content min-w-[7ch] py-0.5 font-medium")}
              />
              <span aria-hidden className="text-muted-foreground/60">at</span>
              <input
                value={organization}
                onChange={edit(setOrganization)}
                placeholder="Organisation"
                aria-label="Organisation or school"
                className={cn(ghostInput, "field-sizing-content min-w-[7ch] py-0.5")}
              />
            </div>
            <div className="flex flex-wrap items-baseline gap-x-1.5 text-muted-foreground">
              <input
                type="month"
                value={startMonth}
                onChange={edit(setStartMonth)}
                aria-label="Start month"
                className={cn(ghostInput, "cv-month w-[9.75rem] py-0.5")}
              />
              <span aria-hidden>–</span>
              {current ? (
                <span className="px-1 py-0.5 text-foreground">Present</span>
              ) : (
                <input
                  type="month"
                  value={endMonth}
                  min={startMonth || undefined}
                  onChange={edit(setEndMonth)}
                  aria-label="End month"
                  aria-invalid={endBeforeStart || undefined}
                  className={cn(ghostInput, "cv-month w-[9.75rem] py-0.5", endBeforeStart && "text-destructive")}
                />
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-pressed={current}
                    onClick={() => {
                      setCurrent((value) => !value);
                      markDirty();
                    }}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-xs transition-colors",
                      current
                        ? "border-transparent bg-muted text-foreground"
                        : "border-dashed border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Current
                  </button>
                </TooltipTrigger>
                <TooltipContent>{current ? "Set an end date instead" : "Still here? Show the end date as Present"}</TooltipContent>
              </Tooltip>
              <input
                value={location}
                onChange={edit(setLocation)}
                placeholder="Location"
                aria-label="Location"
                className={cn(ghostInput, "field-sizing-content min-w-[7ch] py-0.5")}
              />
            </div>
            {endBeforeStart && (
              <p role="alert" className="w-full text-xs text-destructive">
                The end month is before the start month, so this isn&apos;t saved yet.
              </p>
            )}
          </div>
        )}

        <textarea
          value={description}
          onChange={edit(setDescription)}
          placeholder="Add a one-line summary"
          aria-label="Summary"
          rows={1}
          className={cn(
            ghostInput,
            "field-sizing-content mt-1 block w-full resize-none py-0.5 text-sm text-muted-foreground",
            // Only suggest a summary when the section is being looked at or edited.
            "placeholder:opacity-0 group-hover/section:placeholder:opacity-100 group-focus-within/section:placeholder:opacity-100"
          )}
        />

        <div className="relative mt-4">
          {editor && <FormatBubble editor={editor} />}
          <EditorContent editor={editor} className="cv-document-body" />
          {editor && (
            <BlockToolbar
              editor={editor}
              className="pointer-events-none absolute -bottom-9 left-0 opacity-0 transition-opacity group-focus-within/section:pointer-events-auto group-focus-within/section:opacity-100"
            />
          )}
        </div>
      </article>

      <ConfirmationModal
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={onConfirmDelete}
        title={deleteTitle}
        description={deleteDescription}
        confirmLabel="Delete"
        variant="destructive"
      />
    </>
  );
};

export default SectionDocument;
