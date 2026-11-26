import { MoreHorizontalIcon, XIcon, ArchiveIcon, XCircleIcon, Trash2Icon, ArrowUpRightIcon, FileUserIcon, FileTextIcon, Loader2Icon } from "lucide-react";
import { VisuallyHidden } from "radix-ui";
import { SheetContent, SheetTitle } from "../ui/Sheet";
import { JobBoardEntry, JobStatus, jobStatusColors } from "@/lib/types";
import { capitalize, cn } from "@/lib/utils";
import { ReactNode, useState, useMemo, useEffect, useRef, useCallback, useTransition } from "react";
import toast from "react-hot-toast";
import debounce from "lodash.debounce";
import InlineInput from "../ui/InlineInput";
import { SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem, Select } from "../ui/Select";
import { createJobBoardEntry } from "@/api/resources/jobBoardEntries/createJobBoardEntry";
import { updateJobBoardEntry } from "@/api/resources/jobBoardEntries/updateJobBoardEntry";
import { deleteJobBoardEntry } from "@/api/resources/jobBoardEntries/deleteJobBoardEntry";
import { EditorContent, useEditor } from "@tiptap/react";
import SimpleMenuBar from "../richEditor/simpleEditor/SimpleMenuBar";
import { TextStyleKit } from "@tiptap/extension-text-style";
import StarterKit from "@tiptap/starter-kit";
import ConfirmationModal from "../common/ConfirmationModal";
import TagsInput from "./TagsInput";
import { Button } from "../ui/Button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/DropdownMenu";
import NotesArea from "./NotesArea";
import ApplyBar from "./entry/ApplyBar";
import JobSend from "./entry/JobSend";
import { useAuth } from "@/contexts/AuthContext";
import { postingUrl, prepareAction, readiness } from "@/lib/jobBoard/readiness";
import { closingLabel } from "@/lib/jobBoard/sentLog";
import FitBadge from "../common/FitBadge";
import { leaveAfterSave } from "@/lib/jobBoard/leaveAfterSave";
import DocSlot from "./entry/DocSlot";
import { coverLetterSlotState, cvSlotState, EntryPatch, jobSavePatch, jobSaveStarted } from "@/lib/jobBoard/docSlot";
import type { Note } from "@/lib/types";
import { format, parse, parseISO } from "date-fns";

type JobFormSheetProps =
  | {
      mode: "create";
      entry: null;
      allEntries: JobBoardEntry[];
      onClose: () => void;
      onAddJob: (job: JobBoardEntry) => void;
    }
  | {
      mode: "edit";
      /**
       * The side panel tracks the job; the full page is for preparing the application; the pane
       * sits beside the applications list and edits the job in place.
       */
      layout?: "panel" | "page" | "pane";
      /** At the top right of the pane, e.g. a close button over the list on phones. */
      headerAction?: ReactNode;
      /** Opens the full view, from the panel. */
      onPrepare?: () => void;
      /** The way back, on the full page. */
      back?: ReactNode;
      entry: JobBoardEntry;
      allEntries: JobBoardEntry[];
      onClose: () => void;
      /** Applies a change to one job; see EntryPatch. */
      onPatchJob: (id: number, patch: EntryPatch) => void;
      onDelete?: (entry: JobBoardEntry) => void;
      notes: Note[];
      notesLoading: boolean;
      onNoteAdded: (note: Note) => void;
    };

const defaultValues = {
  title: "",
  company: "",
  location: "",
  salary: "",
  url: "",
  status: JobStatus.PENDING as JobStatus,
  description: "",
  tags: [] as string[],
};

const isEditorContentEmpty = (html: string) =>
  !html || html === "<p></p>" || html === "<p><br></p>" || html.replace(/<[^>]*>/g, "").trim() === "";

const toDateInputValue = (date: Date | string | null | undefined): string => {
  if (!date) return "";
  const parsed = typeof date === "string" ? parseISO(date) : date;
  return format(parsed, "yyyy-MM-dd");
};

const toClosingDatePayload = (date: string): Date | null =>
  date ? parse(date, "yyyy-MM-dd", new Date()) : null;

const factInput = "h-9 py-0 text-base";
// Reads as text; hovering or editing shows a soft fill behind it. Pulled out by its padding, so
// the text stays in line with the labels above it.
const paneInput =
  "-mx-1.5 w-[calc(100%+0.75rem)] rounded-md border-transparent px-1.5 transition-colors hover:bg-muted focus:bg-muted aria-invalid:border-transparent aria-invalid:bg-destructive/10";
const paneFieldInput = cn(paneInput, "h-7 py-0 text-sm font-medium");

/** One of the job's facts in the applications pane. */
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
  /** Spans every column. */
  wide?: boolean;
  className?: string;
  hint?: string | null;
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

/** A document's state at a glance: amber while it's missing, green once it's attached. */
const DocStateIcon = ({ filled, icon }: { filled: boolean; icon: ReactNode }) => (
  <span
    aria-hidden
    className={cn(
      "mr-1 grid size-8 shrink-0 place-items-center rounded-md [&_svg]:size-4",
      filled ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-candido/25 text-candido-ink dark:text-candido"
    )}
  >
    {icon}
  </span>
);

const PaneSection = ({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) => (
  <section className="mt-7">
    <div className="mb-2.5 flex items-center justify-between gap-2">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</h3>
      {aside}
    </div>
    {children}
  </section>
);

/** One of the job's facts on the full page. */
const Fact = ({
  label,
  htmlFor,
  wide = false,
  children,
}: {
  label: string;
  htmlFor?: string;
  wide?: boolean;
  children: ReactNode;
}) => (
  <div className={cn("min-w-0", wide && "col-span-2")}>
    <label htmlFor={htmlFor} className="text-sm text-muted-foreground">
      {label}
    </label>
    {children}
  </div>
);

const JobFormSheet = (props: JobFormSheetProps) => {
  const isCreate = props.mode === "create";
  const isPage = props.mode === "edit" && props.layout === "page";
  const isPane = props.mode === "edit" && props.layout === "pane";
  const { user } = useAuth();

  const entry = props.entry;
  const initialTitle = entry?.title ?? defaultValues.title;
  const initialCompany = entry?.company ?? defaultValues.company;
  const initialLocation = entry?.location ?? defaultValues.location;
  const initialSalary = entry?.salary ?? defaultValues.salary;
  const initialUrl = entry?.url ?? defaultValues.url;
  const initialStatus = entry?.status ?? defaultValues.status;
  const initialDescription = entry?.description ?? defaultValues.description;
  const initialTags = entry?.job_board_tags?.map((t) => t.name) ?? defaultValues.tags;
  const initialClosingDate = toDateInputValue(entry?.closing_date);

  const [title, setTitle] = useState<string>(initialTitle);
  const [company, setCompany] = useState<string>(initialCompany);
  const [location, setLocation] = useState<string>(initialLocation);
  const [salary, setSalary] = useState<string>(initialSalary);
  const [url, setUrl] = useState<string>(initialUrl);
  const [status, setStatus] = useState<JobStatus>(initialStatus);
  const [editorHtml, setEditorHtml] = useState(initialDescription);
  const [tags, setTags] = useState<string[]>(initialTags);
  // Creating, moving or deleting the job: locks the form.
  const [loading, setLoading] = useState<boolean>(false);
  // Saving edits: doesn't lock the fields, since disabling one drops its focus and what's typed next.
  const [saving, setSaving] = useState<boolean>(false);
  const [formSubmitted, setFormSubmitted] = useState<boolean>(false);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "failed">("idle");
  const [discardChangesModalOpen, setDiscardChangesModalOpen] = useState<boolean>(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState<boolean>(false);
  const [closingDate, setClosingDate] = useState<string>(initialClosingDate);
  // An action that leaves the sheet (open the CV editor) waiting on the discard-edits prompt.
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);

  const isTitleValid = title.trim().length > 0;
  const isCompanyValid = company.trim().length > 0;

  const extensions = [TextStyleKit, StarterKit];
  const editor = useEditor({
    extensions,
    immediatelyRender: false,
    content: initialDescription,
    onUpdate: ({ editor }) => {
      setEditorHtml(editor.getHTML());
    },
  });

  // The parent remounts the sheet for each job, so the editor starts from this job and
  // are never reset from props: a save's response would otherwise replace text typed meanwhile.

  const hasUpdatedFields = useMemo(() => {
    if (isCreate) {
      return title.trim() !== "" || company.trim() !== "";
    }

    const entryTagNames = entry!.job_board_tags?.map((t) => t.name) ?? [];
    const tagsChanged =
      tags.length !== entryTagNames.length ||
      tags.some((t) => !entryTagNames.includes(t)) ||
      entryTagNames.some((t) => !tags.includes(t));

    return (
      title !== entry!.title ||
      company !== entry!.company ||
      location !== (entry!.location ?? "") ||
      salary !== (entry!.salary ?? "") ||
      url !== (entry!.url ?? "") ||
      status !== entry!.status ||
      closingDate !== toDateInputValue(entry!.closing_date) ||
      editorHtml !== initialDescription ||
      tagsChanged
    );
  }, [isCreate, entry, title, company, location, salary, url, status, closingDate, editorHtml, initialDescription, tags]);

  const stateRef = useRef({ title, company, location, salary, url, status, editorHtml, tags, closingDate });
  stateRef.current = { title, company, location, salary, url, status, editorHtml, tags, closingDate };

  const inFlightRef = useRef<Promise<boolean> | null>(null);
  const performSaveRef = useRef<() => Promise<boolean>>(async () => false);

  const performCreate = useCallback(async (): Promise<boolean> => {
    const { title: title, company: company, location: location, salary: salary, url: url, status: status, editorHtml: html, tags: tags, closingDate } =
      stateRef.current;

    if (!title.trim() || !company.trim()) {
      setFormSubmitted(true);
      return false;
    }

    setLoading(true);

    const closingDateDate = toClosingDatePayload(closingDate);

    try {
      const response = await createJobBoardEntry(title, company, location, salary, url, status, html, tags, closingDateDate ?? undefined);
      if (props.mode === "create") {
        props.onAddJob(response.job_board_entry);
      }
      
      toast.success("Job added successfully");
      return true;
    } catch (error) {
      console.error(error);
      toast.error("Failed to add job");

      return false;
    } finally {
      setLoading(false);
    }
  }, [props]);

  // The fields of a save that failed: autosave waits for an edit instead of retrying them forever.
  const failedRef = useRef<string | null>(null);

  const performUpdate = useCallback(async (): Promise<boolean> => {
    if (isCreate || !entry) return false;
    const { title: title, company: company, location: location, salary: salary, url: url, status: status, editorHtml: editorHtml, tags: tags, closingDate } =
      stateRef.current;

    if (!title.trim() || !company.trim()) {
      setFormSubmitted(true);
      return false;
    }

    const sent = JSON.stringify(stateRef.current);
    setSaving(true);
    try {
      let newNumber: number = entry.number;
      if (status === entry.status) {
        newNumber = entry.number;
      } else {
        const entriesInNewStatus = props.allEntries.filter((e: JobBoardEntry) => e.status === status);
        const maxNumber =
          entriesInNewStatus.length > 0
            ? Math.max(...entriesInNewStatus.map((e: JobBoardEntry) => e.number))
            : 0;
        newNumber = maxNumber + 1;
      }

      const closingDateDate = toClosingDatePayload(closingDate);

      const startedAt = jobSaveStarted();
      const response = await updateJobBoardEntry(
        entry.id,
        title,
        company,
        location,
        salary,
        url,
        editorHtml,
        status,
        newNumber,
        tags,
        closingDateDate
      );

      props.onPatchJob(response.job_board_entry.id, jobSavePatch(response.job_board_entry, startedAt));
      // Show the date as the server stored it, unless it was changed while this save was out.
      if (stateRef.current.closingDate === closingDate) {
        setClosingDate(toDateInputValue(response.job_board_entry.closing_date));
      }
      setSaveState("saved");
      return true;
    } catch (error) {
      console.error(error);
      setSaveState("failed");
      failedRef.current = sent;
      toast.error("Failed to update job");
      return false;
    } finally {
      setSaving(false);
    }
  }, [isCreate, entry, props]);

  // What the newest save sent, to tell whether anything was edited while it was in flight.
  const sentRef = useRef<string | null>(null);
  // Saves and this snapshot all read the ref, so they agree on what was sent even from an old render.
  const fieldsSnapshot = () => JSON.stringify(stateRef.current);
  const trackedUpdate = useCallback(() => {
    sentRef.current = JSON.stringify(stateRef.current);
    const p = performUpdate();
    inFlightRef.current = p;
    void p.finally(() => {
      if (inFlightRef.current === p) inFlightRef.current = null;
    });
    return p;
  }, [performUpdate]);
  performSaveRef.current = isCreate ? performCreate : trackedUpdate;

  // One save at a time, so an older one can't land on the server after a newer one.
  const saveAfterInFlight = async () => {
    await inFlightRef.current?.catch(() => false);
    return performSaveRef.current();
  };

  const debouncedSave = useMemo(
    () =>
      debounce(() => {
        if (!isCreate) void performSaveRef.current();
      }, 600),
    [isCreate]
  );

  useEffect(() => {
    // While a prompt asks whether to keep the edits, saving them would answer for the user.
    if (isCreate || !hasUpdatedFields || loading || saving || discardChangesModalOpen || pendingLeave !== null) {
      return;
    }
    if (failedRef.current === JSON.stringify(stateRef.current)) return;

    debouncedSave();

    return () => {
      debouncedSave.cancel();
    };
  }, [isCreate, title, company, location, salary, url, status, closingDate, editorHtml, tags, hasUpdatedFields, loading, saving, discardChangesModalOpen, pendingLeave, debouncedSave]);

  const isCreateFormEqualToDefaults =
    title.trim() === defaultValues.title &&
    company.trim() === defaultValues.company &&
    location.trim() === defaultValues.location &&
    salary.trim() === defaultValues.salary &&
    url.trim() === defaultValues.url &&
    status === defaultValues.status &&
    isEditorContentEmpty(editorHtml);

  const handleCancelClick = () => {
    if (isCreate) {
      if (!isCreateFormEqualToDefaults) {
        setDiscardChangesModalOpen(true);
      } else {
        props.onClose();
      }

    } else {
      // Edits save by themselves, so closing only asks when saving isn't possible.
      beforeLeave(props.onClose);
    }
  };

  const resetFields = () => {
    setTitle(initialTitle);
    setCompany(initialCompany);
    setLocation(initialLocation);
    setSalary(initialSalary);
    setUrl(initialUrl);
    setStatus(initialStatus);
    setTags(initialTags);
    setClosingDate(initialClosingDate);
    setEditorHtml(initialDescription);
    editor?.commands.setContent(initialDescription);
  };

  const handleDiscardChanges = () => {
    setDiscardChangesModalOpen(false);
    skipFinalSave.current = true;
    // The sheet stays mounted while it closes, so dropped edits must not autosave.
    resetFields();
    props.onClose();
  };

  // The sheet autosaves, so save before leaving; only if that can't happen ask the user.
  const hasUpdatedRef = useRef(hasUpdatedFields);
  hasUpdatedRef.current = hasUpdatedFields;

  const beforeLeave = (action: () => void) => {
    debouncedSave.cancel();
    void leaveAfterSave({
      hasUnsavedEdits: hasUpdatedRef.current,
      inFlight: inFlightRef.current,
      editedSinceInFlight: () => fieldsSnapshot() !== sentRef.current,
      save: trackedUpdate,
      run: action,
      onBlocked: () => setPendingLeave(() => action),
    });
  };

  // However the sheet goes away (the browser's back button too, or picking another job in the
  // applications pane), what was typed is saved.
  const skipFinalSave = useRef(false);
  const entryRef = useRef(entry);
  entryRef.current = entry;
  useEffect(
    () => () => {
      // Only edits: a new job is added by its own button, never by closing the sheet.
      if (isCreate || skipFinalSave.current || !hasUpdatedRef.current) return;
      const fields = stateRef.current;
      const job = entryRef.current;
      // Nothing asks first when the form goes away, so a blank title or company would make the
      // save refuse every other edit. Keep the job's current ones and save the rest.
      if (job && (!fields.title.trim() || !fields.company.trim())) {
        stateRef.current = {
          ...fields,
          title: fields.title.trim() ? fields.title : job.title,
          company: fields.company.trim() ? fields.company : job.company,
        };
        toast("A job needs a title and company, so the previous ones were kept.");
      }
      void performSaveRef.current();
    },
    [isCreate]
  );

  const discardedRef = useRef(false);
  const handleKeepEditing = () => {
    setPendingLeave(null);
    // The modal also calls onClose after Discard and continue; only resume autosave for Keep editing.
    if (discardedRef.current) discardedRef.current = false;
    else debouncedSave();
  };

  const handleDiscardAndContinue = () => {
    const action = pendingLeave;
    discardedRef.current = true;
    skipFinalSave.current = true;
    resetFields();
    action?.();
  };

  const handleSaveChanges = async () => {
    debouncedSave.cancel();
    const success = await saveAfterInFlight();

    if (success) {
      setDiscardChangesModalOpen(false);
      props.onClose();
    }
  };

  const handleStatusAction = async (newStatus: JobStatus) => {
    if (isCreate || !entry) {
      return;
    }

    debouncedSave.cancel();
    setLoading(true);

    try {
      const entriesInNewStatus = props.allEntries.filter((e) => e.status === newStatus);
      const newNumber = entriesInNewStatus.length > 0
        ? Math.max(...entriesInNewStatus.map((e) => e.number)) + 1
        : 1;

      const startedAt = jobSaveStarted();
      const response = await updateJobBoardEntry(
        entry.id,
        stateRef.current.title,
        stateRef.current.company,
        stateRef.current.location,
        stateRef.current.salary,
        stateRef.current.url,
        stateRef.current.editorHtml,
        newStatus,
        newNumber,
        stateRef.current.tags,
        toClosingDatePayload(stateRef.current.closingDate),
      );

      props.onPatchJob(response.job_board_entry.id, jobSavePatch(response.job_board_entry, startedAt));
      setStatus(newStatus);
      toast.success(`Moved to ${capitalize(newStatus.toLowerCase())}`);
      props.onClose();
    } catch (error) {
      console.error(error);
      toast.error(`Failed to move to ${capitalize(newStatus.toLowerCase())}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = () => setDeleteModalOpen(true);

  const handleConfirmDelete = async () => {
    if (isCreate || !entry) {
      return;
    }

    setDeleteModalOpen(false);
    debouncedSave.cancel();
    setLoading(true);

    try {
      await deleteJobBoardEntry(entry.id);

      skipFinalSave.current = true;
      props.onDelete?.(entry);
      toast.success(`Deleted ${entry.title}`);
      props.onClose();
    } catch (error) {
      console.error(error);
      toast.error(`Failed to delete ${entry.title}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitted(true);
    const success = await performCreate();
    if (success) props.onClose();
  };
  
  const ready = entry ? readiness(entry, user?.reviews_available ?? true) : null;
  const prepare = prepareAction(ready);
  // Pending until the full page has loaded, so a slow load shows progress instead of a dead click.
  const [opening, startOpening] = useTransition();
  const notesArea = (
              <NotesArea
                jobBoardEntry={entry}
                notes={entry ? props.notes : []}
                loading={entry ? props.notesLoading : false}
                onNoteAdded={entry ? props.onNoteAdded : () => { return }}
              />
  );

  const saveStatus = !isCreate && (
    <span role="status" className={cn("text-xs", saveState === "failed" ? "text-destructive" : "text-muted-foreground")}>
      {saving ? "Saving…" : saveState === "failed" ? "Not saved" : saveState === "saved" ? "Saved" : ""}
    </span>
  );

  const prompts = (
    <>
      <ConfirmationModal
        isOpen={discardChangesModalOpen}
        onConfirm={handleSaveChanges}
        onCancel={handleDiscardChanges}
        onClose={() => setDiscardChangesModalOpen(false)}
        title={isCreate ? "Discard new job?" : "Save or Discard Changes"}
        description={
          isCreate
            ? "Do you want to discard or add this job?"
            : "Do you want to discard or save your changes?"
        }
        confirmLabel={isCreate ? "Create" : "Update"}
        cancelLabel="Discard"
      />

      <ConfirmationModal
        isOpen={pendingLeave !== null}
        onClose={handleKeepEditing}
        onConfirm={handleDiscardAndContinue}
        title="Couldn't save your changes"
        description="Discard them and continue, or keep editing?"
        confirmLabel="Discard and continue"
        cancelLabel="Keep editing"
        variant="destructive"
      />

      {!isCreate && entry && (
        <ConfirmationModal
          isOpen={deleteModalOpen}
          onClose={() => setDeleteModalOpen(false)}
          onConfirm={handleConfirmDelete}
          title="Delete job?"
          description={`Are you sure you want to delete "${entry.title}" at ${entry.company}? This cannot be undone.`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          variant="destructive"
        />
      )}
    </>
  );

  const moreMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="More job actions" disabled={loading || saving}>
          <MoreHorizontalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => void handleStatusAction(JobStatus.REJECTED)}>
          <XCircleIcon />
          Move to Rejected
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void handleStatusAction(JobStatus.ARCHIVED)}>
          <ArchiveIcon />
          Archive
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={handleDeleteClick}>
          <Trash2Icon />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const posting = postingUrl(url);
  const closing = status === JobStatus.PENDING ? closingLabel(closingDate ? parseISO(closingDate) : null) : null;
  // The job's fields, edited in place: beside the applications list, and in the board's side panel.
  // Shared by the pane (editing a job) and the form for adding one, so the two look the same.
  const statusPill = (
    <Select value={status} onValueChange={(v) => setStatus(v as JobStatus)} disabled={loading}>
      <SelectTrigger size="sm" className="w-auto gap-2 rounded-full bg-background" aria-label="Status">
        <i className={cn("size-2 rounded-full", jobStatusColors[status])} aria-hidden />
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        <SelectGroup>
          {Object.values(JobStatus).map((s) => (
            <SelectItem key={s} value={s}>
              {capitalize(s.toLowerCase())}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
  // A new job's empty fields are only wrong once adding it is tried; an edited job's, straight away.
  const showInvalid = !isCreate || formSubmitted;
  const titleFields = (
    <>
      {/* Grows to a second line, so a long title isn't cut off beside the status. */}
      <textarea
        id="title"
        rows={1}
        value={title}
        // One line of text: no line breaks, typed or pasted.
        onChange={(e) => setTitle(e.target.value.replace(/\s*\n\s*/g, " "))}
        onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
        disabled={loading}
        aria-label="Job title"
        aria-invalid={(showInvalid && !isTitleValid) || undefined}
        placeholder="Job title"
        className={cn(
          "block w-full resize-none rounded-none border-b bg-transparent px-0 outline-none [field-sizing:content] placeholder:text-muted-foreground aria-invalid:border-destructive disabled:opacity-50",
          paneInput,
          "py-0.5 text-2xl font-bold leading-tight tracking-tight"
        )}
      />
      {formSubmitted && !isTitleValid && <p className="text-xs text-destructive">A job needs a title.</p>}
      <InlineInput
        id="company"
        value={company}
        onChange={(e) => setCompany(e.target.value)}
        disabled={loading}
        aria-label="Company"
        aria-invalid={(showInvalid && !isCompanyValid) || undefined}
        placeholder="Company"
        className={cn(paneInput, "mt-0.5 py-0.5 text-muted-foreground focus:text-foreground")}
      />
      {formSubmitted && !isCompanyValid && <p className="text-xs text-destructive">A job needs a company.</p>}
    </>
  );
  // The title and company, with the status and actions on the title's line.
  const header = (actions: ReactNode) => (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">{titleFields}</div>
      <div className="flex shrink-0 items-center gap-1 pt-0.5">{actions}</div>
    </div>
  );
  const factsBox = (
    <div className="@container mt-5">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border @md:grid-cols-3">
        <PaneField label="Location" htmlFor="location">
          <InlineInput id="location" value={location} onChange={(e) => setLocation(e.target.value)} disabled={loading} placeholder="Add" className={paneFieldInput} />
        </PaneField>
        <PaneField label="Salary" htmlFor="salary">
          <InlineInput id="salary" value={salary} onChange={(e) => setSalary(e.target.value)} disabled={loading} placeholder="Add" className={paneFieldInput} />
        </PaneField>
        {/* Beside location and salary when there's room; its own row in a narrow pane. */}
        <PaneField label="Closing date" htmlFor="closingDate" hint={closing} className="col-span-2 @md:col-span-1">
          <InlineInput id="closingDate" type="date" value={closingDate} onChange={(e) => setClosingDate(e.target.value)} disabled={loading} className={paneFieldInput} />
        </PaneField>
        <PaneField label="Link" htmlFor="url" wide>
          <div className="flex items-center gap-2">
            <InlineInput id="url" value={url} onChange={(e) => setUrl(e.target.value)} disabled={loading} placeholder="Add" className={cn(paneFieldInput, "min-w-0 flex-1")} />
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
            wrap
            allEntries={props.allEntries}
            tags={tags}
            onTagsChange={setTags}
            className={cn(paneInput, "mt-1 min-h-7 py-1 text-sm font-medium")}
          />
        </PaneField>
    </div>
    </div>
  );
  const descriptionEditor = (
    <PaneSection title="Job description">
      <div className="simple-editor-wrapper flex flex-col overflow-hidden rounded-lg border border-border bg-background">
        {editor && <SimpleMenuBar editor={editor} />}
        <EditorContent
          editor={editor}
          onClick={(event) => event.target === event.currentTarget && editor?.commands.focus("end")}
          className="max-h-80 min-h-28 cursor-text overflow-y-auto leading-relaxed"
        />
      </div>
    </PaneSection>
  );

  const paneBody = (headerAction: ReactNode, padding: string) =>
    entry && (
        <div className={cn("flex flex-col", padding)}>
          {header(
            <>
              {saveStatus}
              {statusPill}
              {moreMenu}
              {headerAction}
            </>
          )}

          {factsBox}

          <PaneSection
            title="Documents"
            aside={entry.cv_curriculum?.fit ? <FitBadge fit={entry.cv_curriculum.fit} /> : null}
          >
            <div className="divide-y divide-border rounded-lg border border-border bg-background [&>*]:px-4 [&>*]:py-3">
              <DocSlot
                kind="cv"
                entry={entry}
                onPatchEntry={props.onPatchJob}
                beforeLeave={beforeLeave}
                isNext={cvSlotState(entry) === "empty"}
                leading={<DocStateIcon filled={cvSlotState(entry) !== "empty"} icon={<FileUserIcon />} />}
              />
              <DocSlot
                kind="cover_letter"
                entry={entry}
                onPatchEntry={props.onPatchJob}
                leading={<DocStateIcon filled={coverLetterSlotState(entry) !== "empty"} icon={<FileTextIcon />} />}
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant={ready && ready.state !== "no_cv" ? "candido" : "outline"}
              className="mt-3 w-full sm:w-auto"
              disabled={opening}
              onClick={() => {
                const open = props.onPrepare;
                if (open) beforeLeave(() => startOpening(open));
              }}
            >
              {opening ? "Opening…" : prepare.label}
              {opening ? <Loader2Icon className="animate-spin" /> : <ArrowUpRightIcon />}
            </Button>
          </PaneSection>

          {descriptionEditor}

          <PaneSection title="Notes">{notesArea}</PaneSection>

          <p className="mt-7 text-xs text-muted-foreground">
            Added {format(new Date(entry.created_at), "d MMM yyyy")}
            <span className="mx-2 text-border">·</span>
            Updated {format(new Date(entry.updated_at), "d MMM yyyy")}
          </p>
        </div>
    );

  // Adding a job: the pane's fields, with the job added by its own button.
  const createForm = (
    <form onSubmit={handleCreateSubmit} className="min-h-0 flex-1 overflow-y-auto bg-muted/30">
      <div className="flex flex-col px-6 pb-8 pt-6 sm:px-9 sm:pt-7">
        {header(
          <>
            {statusPill}
            <Button type="button" variant="ghost" size="icon-sm" onClick={handleCancelClick} aria-label="Close">
              <XIcon />
            </Button>
          </>
        )}
        {factsBox}
        {descriptionEditor}
        <Button type="submit" disabled={loading} className="mt-7 w-full sm:w-auto sm:self-start">
          {loading ? "Adding…" : "Add job"}
        </Button>
      </div>
    </form>
  );

  if (isPane) {
    return (
      <>
        {paneBody(props.headerAction, "px-5 pb-6 pt-5 sm:px-7 sm:pt-6")}
        {prompts}
      </>
    );
  }

  if (isPage) {
    return (
      <>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:overflow-hidden">
          <header className="shrink-0 border-b border-border px-4 pt-4 pb-5 sm:px-6 min-[90rem]:px-14 min-[106rem]:px-20">
            {props.back}
            <div className="mt-2 flex items-center gap-3">
              <span className={cn("size-4 shrink-0 rounded-sm", jobStatusColors[status])} aria-hidden />
              <InlineInput
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={loading}
                aria-label="Job title"
                aria-invalid={!isTitleValid || undefined}
                placeholder="Job title"
                className={cn("min-w-0 flex-1 border-b-0 py-0 text-3xl font-semibold tracking-tight", !isTitleValid && "border-b")}
              />
              {saveStatus}
              {moreMenu}
            </div>
          </header>

          <div className="grid shrink-0 grid-cols-1 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <section className="order-last flex min-h-0 flex-col gap-6 border-t border-border px-4 py-5 sm:px-6 min-[90rem]:px-14 min-[106rem]:px-20 min-[90rem]:py-8 lg:order-none lg:overflow-y-auto lg:border-t-0 lg:border-r">
              <h2 className="flex min-h-9 items-center text-xl font-semibold tracking-tight">Job details</h2>
              <div className="grid grid-cols-2 gap-x-6 gap-y-5 min-[90rem]:gap-x-10">
              <Fact label="Company" htmlFor="company">
                <InlineInput id="company" value={company} onChange={(e) => setCompany(e.target.value)} disabled={loading} aria-invalid={!isCompanyValid || undefined} placeholder="Required" className={factInput} />
              </Fact>
              <Fact label="Status" htmlFor="status">
                <Select value={status} onValueChange={(v) => setStatus(v as JobStatus)} disabled={loading}>
                  <SelectTrigger id="status" className="h-9! w-full rounded-none border-0 border-b border-border px-0 text-base shadow-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {Object.values(JobStatus).map((s) => (
                      <SelectItem key={s} value={s}>
                        {capitalize(s.toLowerCase())}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Fact>
              <Fact label="Location" htmlFor="location">
                <InlineInput id="location" value={location} onChange={(e) => setLocation(e.target.value)} disabled={loading} placeholder="Add" className={factInput} />
              </Fact>
              <Fact label="Closing date" htmlFor="closingDate">
                <InlineInput id="closingDate" type="date" value={closingDate} onChange={(e) => setClosingDate(e.target.value)} disabled={loading} className={factInput} />
              </Fact>
              <Fact label="Salary" htmlFor="salary">
                <InlineInput id="salary" value={salary} onChange={(e) => setSalary(e.target.value)} disabled={loading} placeholder="Add" className={factInput} />
              </Fact>
              <Fact label="Posting link" htmlFor="url">
                <InlineInput id="url" value={url} onChange={(e) => setUrl(e.target.value)} disabled={loading} placeholder="Add" className={factInput} />
              </Fact>
              <Fact label="Tags" wide>
                <TagsInput compact wrap allEntries={props.allEntries} tags={tags} onTagsChange={setTags} />
              </Fact>
              </div>
              <div className="flex min-h-72 shrink-0 flex-1 flex-col gap-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <h3 className="text-sm text-muted-foreground">Description</h3>
                  {ready && isEditorContentEmpty(editorHtml) && (
                    <p className="text-sm text-muted-foreground">Paste the posting. Your CV is compared with it.</p>
                  )}
                </div>
              <div className="simple-editor-wrapper flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border">
                {editor && <SimpleMenuBar editor={editor} />}
                <EditorContent
                  editor={editor}
                  // Clicking below the text writes in it too.
                  onClick={(event) => event.target === event.currentTarget && editor?.commands.focus("end")}
                  className="max-h-[60vh] min-h-0 flex-1 cursor-text overflow-y-auto leading-relaxed lg:max-h-none"
                />
              </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <h3 className="text-sm text-muted-foreground">Notes</h3>
                {notesArea}
              </div>
            </section>

            <section className="min-h-0 bg-muted/40 px-4 py-5 sm:px-6 min-[90rem]:px-14 min-[106rem]:px-20 min-[90rem]:py-8 lg:overflow-y-auto">
              <JobSend entry={props.entry} onPatchEntry={props.onPatchJob} beforeLeave={beforeLeave} />
            </section>
          </div>

          {ready && (
            // Marking as applied saves like any other edit to the job.
            <ApplyBar entry={props.entry} readiness={ready} onApplied={() => setStatus(JobStatus.APPLIED)} />
          )}
        </div>
        {prompts}
      </>
    );
  }

  return (
    <SheetContent
      showCloseButton={false}
      onOpenAutoFocus={(e) => e.preventDefault()}
      onInteractOutside={(e) => {
        e.preventDefault();
        handleCancelClick();
      }}
      onEscapeKeyDown={(e) => {
        e.preventDefault();
        handleCancelClick();
      }}
      className="w-full sm:max-w-2xl p-0 gap-0 flex flex-col border-l border-border"
    >
      <VisuallyHidden.Root>
        <SheetTitle>{isCreate ? "Create job" : `Edit job: ${title || "Untitled"}`}</SheetTitle>
      </VisuallyHidden.Root>

      {isCreate ? (
        createForm
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/30">
          {paneBody(
            <Button type="button" variant="ghost" size="icon-sm" onClick={handleCancelClick} aria-label="Close">
              <XIcon />
            </Button>,
            "px-6 pb-8 pt-6 sm:px-9 sm:pt-7"
          )}
        </div>
      )}
      {prompts}
    </SheetContent>
  );
};

export default JobFormSheet;
