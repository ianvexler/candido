import { MoreHorizontalIcon, XIcon, ArchiveIcon, XCircleIcon, Trash2Icon, ArrowUpRightIcon } from "lucide-react";
import { VisuallyHidden } from "radix-ui";
import { SheetContent, SheetTitle } from "../ui/Sheet";
import { JobBoardEntry, JobStatus, jobStatusColors } from "@/lib/types";
import { capitalize, cn } from "@/lib/utils";
import { ReactNode, useState, useMemo, useEffect, useRef, useCallback } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/Tabs";
import NotesArea from "./NotesArea";
import ApplyBar from "./entry/ApplyBar";
import JobSend from "./entry/JobSend";
import { useAuth } from "@/contexts/AuthContext";
import { postingUrl, prepareAction, readiness } from "@/lib/jobBoard/readiness";
import { closingLabel } from "@/lib/jobBoard/sentLog";
import FitBadge from "../common/FitBadge";
import { leaveAfterSave } from "@/lib/jobBoard/leaveAfterSave";
import DocSlot from "./entry/DocSlot";
import { EntryPatch, jobSavePatch, jobSaveStarted } from "@/lib/jobBoard/docSlot";
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
// Reads as text until hovered or focused, then shows the underline of a field.
const paneInput = "border-transparent hover:border-border focus:border-foreground";
const paneFieldInput = cn(paneInput, "h-7 py-0 text-sm font-medium");

/** One of the job's facts in the applications pane. */
const PaneField = ({
  label,
  htmlFor,
  hint,
  action,
  wide = false,
  children,
}: {
  label: string;
  htmlFor?: string;
  /** Spans both columns. */
  wide?: boolean;
  hint?: string | null;
  action?: ReactNode;
  children: ReactNode;
}) => (
  <div className={cn("min-w-0 bg-background px-4 py-2.5", wide && "col-span-2")}>
    <div className="flex items-center justify-between gap-2">
      <label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </label>
      {action}
    </div>
    {children}
    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
  </div>
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
  const [detailsTab, setDetailsTab] = useState<"description" | "notes" | "documents">("description");
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

  // The parent remounts the sheet for each job, so the editor and tabs start from this job and
  // are never reset from props: a save's response would otherwise replace text typed meanwhile.

  const handleDetailsTabChange = (value: string) => {
    setDetailsTab(value as "description" | "notes" | "documents");
    
    if (value === "description") {
      requestAnimationFrame(() => {
        editor?.commands.focus("end");
      });
    }
  };

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

  const panel = (
    <>
      <div className="shrink-0 border-b border-border bg-muted/30">
        <div className="flex items-start justify-between gap-4 px-6 py-5">
          <div className="min-w-0 flex-1 flex flex-col gap-1">
            <div className="flex items-center gap-3 pt-1">
              <div
                className={`shrink-0 w-5 h-5 rounded-sm ${jobStatusColors[status]}`}
                title={status.toLowerCase()}
              />

              <InlineInput
                id="title"
                type="text"
                autoComplete="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={loading}
                placeholder="Job title..."
                className={`text-2xl font-semibold tracking-tight bg-transparent border-b-0 ${formSubmitted && !isTitleValid ? "border-b-2! border-red-500!" : ""}`}
              />
            </div>
            {formSubmitted && !isTitleValid && (
              <p className="text-xs text-red-500 ml-8">Title is required</p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
          {saveStatus}
          <button
            type="button"
            onClick={handleCancelClick}
            className="cursor-pointer shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <XIcon className="size-5" />
          </button>
          </div>
        </div>
      </div>

      {!isCreate && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-6 py-2.5">
          <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                !ready ? "bg-border" : ready.state === "ready" ? "bg-emerald-500" : "bg-candido"
              )}
              aria-hidden
            />
            <span className="truncate">{prepare.detail ?? capitalize(entry!.status.toLowerCase())}</span>
          </p>
          <Button
            type="button"
            size="sm"
            variant={ready ? "candido" : "ghost"}
            className="shrink-0"
            onClick={() => props.onPrepare && beforeLeave(props.onPrepare)}
          >
            {prepare.label}
          </Button>
        </div>
      )}

      <form
        onSubmit={handleCreateSubmit}
        className="flex flex-col gap-6 overflow-y-auto flex-1 min-h-0 px-6 py-6"
      >
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-5">
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Company
              </h3>

              <div className="flex flex-col gap-1">
                <InlineInput
                  id="company"
                  type="text"
                  autoComplete="company"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  disabled={loading}
                  placeholder="Company name..."
                  className={formSubmitted && !isCompanyValid ? "border-red-500!" : ""}
                />
                {formSubmitted && !isCompanyValid && (
                  <p className="text-xs text-red-500">Company is required</p>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Status
              </h3>

              <Select value={status} onValueChange={(v) => setStatus(v as JobStatus)} disabled={loading}>
                <SelectTrigger className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>

                <SelectContent position="popper">
                  <SelectGroup>
                    {Object.values(JobStatus).map((s) => (
                      <SelectItem key={s} value={s}>
                        {capitalize(s.toLowerCase())}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Location
              </h3>

              <InlineInput
                id="location"
                type="text"
                autoComplete="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                disabled={loading}
                placeholder="e.g. Remote, New York"
              />
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Closing Date
              </h3>

              <InlineInput
                id="closingDate"
                type="date"
                autoComplete="closingDate"
                value={closingDate}
                onChange={(e) => setClosingDate(e.target.value)}
                disabled={loading}
                placeholder="e.g. 2001-01-01"
              />
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Salary
              </h3>

              <InlineInput
                id="salary"
                type="text"
                autoComplete="salary"
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
                disabled={loading}
                placeholder="e.g. $120k - $150k"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              URL
            </h3>

            <InlineInput
              id="url"
              type="text"
              autoComplete="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={loading}
              placeholder="https://example.com"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Tags
          </h3>

          <TagsInput
            allEntries={props.allEntries}
            tags={tags}
            onTagsChange={setTags}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Tabs value={detailsTab} onValueChange={handleDetailsTabChange} className="w-full">
            <TabsList>
              <TabsTrigger value="description" className="px-4">Description</TabsTrigger>
              <TabsTrigger value="notes" className="px-4" disabled={isCreate}>Notes</TabsTrigger>
              {!isCreate && <TabsTrigger value="documents" className="px-4">Documents</TabsTrigger>}
            </TabsList>

            <TabsContent value="notes">{notesArea}</TabsContent>
            {!isCreate && entry && (
              // Kept mounted, so switching tabs doesn't lose a half-typed document.
              <TabsContent value="documents" forceMount className="data-[state=inactive]:hidden">
                <div className="divide-y divide-border rounded-lg border border-border [&>*]:px-4 [&>*]:py-3">
                  <DocSlot kind="cv" entry={entry} onPatchEntry={props.onPatchJob} beforeLeave={beforeLeave} canTailor={false} />
                  <DocSlot kind="cover_letter" entry={entry} onPatchEntry={props.onPatchJob} />
                </div>
              </TabsContent>
            )}

            <TabsContent
              value="description"
              forceMount
              className="data-[state=inactive]:hidden"
            >
              <div className="simple-editor-wrapper rounded-lg border border-border bg-background overflow-hidden">
                {editor && <SimpleMenuBar editor={editor} />}
                <EditorContent editor={editor} className="min-h-[140px]" />
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            {isCreate ? (
              <Button type="submit" disabled={loading || saving} className="w-fit">
                {loading ? "Creating..." : "Create"}
              </Button>
            ) : (
              <>
                <div />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={loading || saving}
                    onClick={() => handleStatusAction(JobStatus.REJECTED)}
                  >
                    <XCircleIcon className="size-4" />
                    Rejected
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={loading || saving}
                    onClick={() => handleStatusAction(JobStatus.ARCHIVED)}
                  >
                    <ArchiveIcon className="size-4" />
                    Archive
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={loading || saving}
                    onClick={handleDeleteClick}
                  >
                    <Trash2Icon className="size-4" />
                    Delete
                  </Button>
                </div>
              </>
            )}
          </div>

          <div className="flex flex-row justify-end gap-2">
            {!isCreate && entry && (
              <p className="text-xs text-muted-foreground">
                Created: {format(new Date(entry.created_at), "MMM d, yyyy")}
                <span className="mx-2 text-border">·</span>
                Updated: {format(new Date(entry.updated_at), "MMM d, yyyy")}
              </p>
            )}
          </div>
        </div>
      </form>
    </>
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

  if (isPane && entry) {
    const posting = postingUrl(url);
    const closing = status === JobStatus.PENDING ? closingLabel(closingDate ? parseISO(closingDate) : null) : null;
    return (
      <>
        <div className="flex flex-col px-5 pb-6 pt-5 sm:px-7 sm:pt-6">
          <div className="flex items-center justify-between gap-2">
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
            <div className="flex items-center gap-1">
              {saveStatus}
              {moreMenu}
              {props.headerAction}
            </div>
          </div>

          <InlineInput
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={loading}
            aria-label="Job title"
            aria-invalid={!isTitleValid || undefined}
            placeholder="Job title"
            className={cn(paneInput, "mt-4 py-0.5 text-2xl font-bold leading-tight tracking-tight")}
          />
          <InlineInput
            id="company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            disabled={loading}
            aria-label="Company"
            aria-invalid={!isCompanyValid || undefined}
            placeholder="Company"
            className={cn(paneInput, "mt-0.5 py-0.5 text-muted-foreground focus:text-foreground")}
          />

          <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border">
            <PaneField label="Location" htmlFor="location">
              <InlineInput id="location" value={location} onChange={(e) => setLocation(e.target.value)} disabled={loading} placeholder="Add" className={paneFieldInput} />
            </PaneField>
            <PaneField label="Salary" htmlFor="salary">
              <InlineInput id="salary" value={salary} onChange={(e) => setSalary(e.target.value)} disabled={loading} placeholder="Add" className={paneFieldInput} />
            </PaneField>
            <PaneField label="Closing date" htmlFor="closingDate" hint={closing}>
              <InlineInput id="closingDate" type="date" value={closingDate} onChange={(e) => setClosingDate(e.target.value)} disabled={loading} className={paneFieldInput} />
            </PaneField>
            <PaneField
              label="Posting link"
              htmlFor="url"
              action={
                posting && (
                  <a href={posting} target="_blank" rel="noopener noreferrer" aria-label="Open the posting" className="text-muted-foreground hover:text-foreground">
                    <ArrowUpRightIcon className="size-4" />
                  </a>
                )
              }
            >
              <InlineInput id="url" value={url} onChange={(e) => setUrl(e.target.value)} disabled={loading} placeholder="Add" className={paneFieldInput} />
            </PaneField>
            <PaneField label="Tags" wide>
              <TagsInput
                compact
                allEntries={props.allEntries}
                tags={tags}
                onTagsChange={setTags}
                className="mt-1.5 h-7 text-sm font-medium hover:bg-transparent hover:border-border border-transparent"
              />
            </PaneField>
          </div>

          <PaneSection
            title={status === JobStatus.PENDING ? "What you'll send" : "What you sent"}
            aside={entry.cv_curriculum?.fit ? <FitBadge fit={entry.cv_curriculum.fit} /> : null}
          >
            <div className="divide-y divide-border rounded-lg border border-border bg-background [&>*]:px-4 [&>*]:py-3">
              <DocSlot kind="cv" entry={entry} onPatchEntry={props.onPatchJob} beforeLeave={beforeLeave} />
              <DocSlot kind="cover_letter" entry={entry} onPatchEntry={props.onPatchJob} />
            </div>
            <Button
              type="button"
              size="sm"
              variant={ready && ready.state !== "no_cv" ? "candido" : "outline"}
              className="mt-3 w-full sm:w-auto"
              onClick={() => props.onPrepare && beforeLeave(props.onPrepare)}
            >
              {prepare.label}
              <ArrowUpRightIcon />
            </Button>
          </PaneSection>

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

          <PaneSection title="Notes">{notesArea}</PaneSection>

          <p className="mt-7 text-xs text-muted-foreground">
            Added {format(new Date(entry.created_at), "d MMM yyyy")}
            <span className="mx-2 text-border">·</span>
            Updated {format(new Date(entry.updated_at), "d MMM yyyy")}
          </p>
        </div>
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
                <TagsInput compact allEntries={props.allEntries} tags={tags} onTagsChange={setTags} />
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

      {panel}
      {prompts}
    </SheetContent>
  );
};

export default JobFormSheet;
