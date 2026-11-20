"use client";

import ConfirmationModal from "@/components/common/ConfirmationModal";
import SimpleMenuBar from "@/components/richEditor/simpleEditor/SimpleMenuBar";
import "@/components/richEditor/styles.scss";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import InlineInput from "@/components/ui/InlineInput";
import { Textarea } from "@/components/ui/Textarea";
import { cn } from "@/lib/utils";
import { SectionFields } from "@/lib/types";
import Link from "@tiptap/extension-link";
import { TextStyleKit } from "@tiptap/extension-text-style";
import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import { CalendarIcon, EyeIcon, EyeOffIcon, Trash2Icon, XIcon } from "lucide-react";
import { ReactNode, Ref, useEffect, useState } from "react";
import toast from "react-hot-toast";
import HiddenMark from "./HiddenMark";
import { normalizeContent } from "./documentContent";
import { fromMonthInput, hasDetails, suggestsDetails, toMonthInput } from "./sectionDetails";

const SAVE_DELAY_MS = 600;

interface SectionDocumentProps<T extends SectionFields> {
  section: T;
  /** Persists the fields and resolves with the saved record. */
  save: (fields: SectionFields) => Promise<T>;
  onSaved: (next: T) => void;
  /** Deletes the record. Rejecting keeps the section on screen. */
  onDelete: () => Promise<void>;
  deleteTitle: string;
  deleteDescription: string;
  /** Extra controls at the top right, shown before the delete button. */
  actions?: ReactNode;
  /** Shown above the section, e.g. a "library changed" notice. */
  notice?: ReactNode;
  /** Fades the page, e.g. when the section is hidden from a CV. */
  dimmed?: boolean;
  articleRef?: Ref<HTMLElement>;
  className?: string;
}

/**
 * A paper-style editor for one section. Edits autosave after a short pause.
 * The editor is uncontrolled: remount it (change its key) to load new content.
 */
const SectionDocument = <T extends SectionFields>({
  section,
  save,
  onSaved,
  onDelete,
  deleteTitle,
  deleteDescription,
  actions,
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
    ],
    immediatelyRender: false,
    content: section.content || "<p></p>",
    editorProps: {
      attributes: {
        class:
          "cv-document-editor outline-none min-h-40 [&_span[data-cv-hidden]]:bg-amber-100 [&_span[data-cv-hidden]]:text-amber-900/80 [&_span[data-cv-hidden]]:line-through [&_span[data-cv-hidden]]:rounded-sm [&_span[data-cv-hidden]]:px-0.5",
      },
    },
    onUpdate: markDirty,
  });

  useEffect(() => {
    if (dirty === 0 || !editor) return;

    const timer = setTimeout(() => {
      setDirty(0);
      // Shown inline; the server would reject it anyway.
      if (endBeforeStart) return;
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
      if (unchanged) return;

      void save(fields)
        .then(onSaved)
        .catch((error) => {
          console.error(error);
          toast.error(error?.response?.data?.error ?? "Failed to save section");
        });
    }, SAVE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [
    dirty, editor, title, sectionType, description, role, organization, location,
    startMonth, endMonth, current, endBeforeStart, section, save, onSaved,
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
          "group relative mx-auto w-full max-w-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08),0_8px_24px_rgba(0,0,0,0.06)] px-10 py-10 sm:px-14 transition-opacity",
          dimmed && "opacity-55",
          className
        )}
      >
        <div className="absolute right-4 top-4 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          {actions}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setDeleteOpen(true)}
            aria-label="Delete section"
          >
            <Trash2Icon />
          </Button>
        </div>

        {notice}

        <InlineInput
          value={sectionType}
          onChange={(event) => {
            setSectionType(event.target.value);
            markDirty();
          }}
          placeholder="Section type"
          className="border-0 py-0 pr-28 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground placeholder:normal-case placeholder:tracking-normal"
        />
        <InlineInput
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            markDirty();
          }}
          placeholder="Title"
          className="border-0 py-1 text-xl font-semibold"
        />
        {showDetails ? (
          <div className="mb-1 mt-1 space-y-1 rounded-md bg-muted/40 px-3 py-2">
            <div className="grid gap-x-4 sm:grid-cols-3">
              <InlineInput
                value={role}
                onChange={(event) => {
                  setRole(event.target.value);
                  markDirty();
                }}
                placeholder="Role or degree"
                aria-label="Role or degree"
                className="border-0 py-1 text-sm font-medium"
              />
              <InlineInput
                value={organization}
                onChange={(event) => {
                  setOrganization(event.target.value);
                  markDirty();
                }}
                placeholder="Organisation"
                aria-label="Organisation or school"
                className="border-0 py-1 text-sm"
              />
              <InlineInput
                value={location}
                onChange={(event) => {
                  setLocation(event.target.value);
                  markDirty();
                }}
                placeholder="Location"
                aria-label="Location"
                className="border-0 py-1 text-sm"
              />
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <CalendarIcon className="size-3.5" />
              <InlineInput
                type="month"
                value={startMonth}
                onChange={(event) => {
                  setStartMonth(event.target.value);
                  markDirty();
                }}
                aria-label="Start month"
                className="w-36 border-0 py-1 text-sm"
              />
              <span>–</span>
              {current ? (
                <span className="w-36 py-1 text-foreground">Present</span>
              ) : (
                <InlineInput
                  type="month"
                  value={endMonth}
                  min={startMonth || undefined}
                  onChange={(event) => {
                    setEndMonth(event.target.value);
                    markDirty();
                  }}
                  aria-label="End month"
                  className="w-36 border-0 py-1 text-sm"
                />
              )}
              <label className="inline-flex cursor-pointer items-center gap-1.5">
                <Checkbox
                  checked={current}
                  onCheckedChange={(checked) => {
                    setCurrent(checked === true);
                    markDirty();
                  }}
                />
                Current
              </label>
              {endBeforeStart && (
                <span role="alert" className="text-xs text-destructive">
                  End is before start; not saved
                </span>
              )}
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="ml-auto"
                onClick={clearDetails}
              >
                <XIcon />
                Clear
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="-ml-2 text-muted-foreground"
            onClick={() => setDetailsOpen(true)}
          >
            <CalendarIcon />
            Add role and dates
          </Button>
        )}

        <Textarea
          value={description}
          onChange={(event) => {
            setDescription(event.target.value);
            markDirty();
          }}
          placeholder="Optional summary"
          rows={1}
          className="min-h-0 resize-none border-0 bg-transparent px-0 py-1 shadow-none focus-visible:ring-0 text-sm text-muted-foreground"
        />

        <div className="simple-editor-wrapper mt-4 rounded-lg border border-border bg-background overflow-hidden">
          {editor && <SimpleMenuBar editor={editor} />}
          {editor && (
            <BubbleMenu
              editor={editor}
              shouldShow={({ from, to }) => from !== to}
              options={{ placement: "top" }}
              className="flex items-center gap-1 rounded-md border border-border bg-background p-1 shadow-md"
            >
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => editor.chain().focus().setHidden().run()}
              >
                <EyeOffIcon />
                Hide
              </Button>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => editor.chain().focus().unsetHidden().run()}
              >
                <EyeIcon />
                Show
              </Button>
            </BubbleMenu>
          )}
          <EditorContent editor={editor} />
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
