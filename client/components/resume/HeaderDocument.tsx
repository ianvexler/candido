"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import { ResumeHeader, ResumeHeaderTextField, ResumeLink } from "@/lib/types";
import { InfoIcon, LinkIcon, PencilIcon, PlusIcon, RotateCcwIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import IconAction from "./IconAction";
import { markPending, markSettled } from "@/lib/resume/saveTracker";
import { ghostInput } from "./styles";

const SAVE_DELAY_MS = 600;

const MAX_LINKS = 10;

type HeaderDraft = Partial<ResumeHeader>;

interface HeaderDocumentProps<T extends HeaderDraft> {
  value: T;
  /**
   * Resume mode: the profile values. Blank fields show these as placeholders
   * and fall back to them. Omit when editing the profile itself.
   */
  fallback?: ResumeHeader;
  save: (draft: T) => Promise<void>;
}

const CONTACT_FIELDS: { field: ResumeHeaderTextField; placeholder: string }[] = [
  { field: "email", placeholder: "Email" },
  { field: "phone", placeholder: "Phone" },
  { field: "location", placeholder: "Location" },
];

/**
 * The name and contact block at the top of a resume. Autosaves after a pause.
 * Uncontrolled after mount: remount it to load a different value.
 */
const HeaderDocument = <T extends HeaderDraft>({ value, fallback, save }: HeaderDocumentProps<T>) => {
  const [draft, setDraft] = useState<T>(value);
  const [dirty, setDirty] = useState(0);
  const isOverride = fallback !== undefined;

  const update = (next: T) => {
    setDraft(next);
    setDirty((count) => count + 1);
  };

  // Export waits on these: unsaved edits, then the request carrying them.
  useEffect(
    () => () => {
      markSettled("header:edit");
      markSettled("header:save");
    },
    []
  );

  useEffect(() => {
    if (dirty === 0) {
      markSettled("header:edit");
      return;
    }
    markPending("header:edit");

    const timer = setTimeout(() => {
      setDirty(0);
      markPending("header:save");
      markSettled("header:edit");
      void save(draft)
        .catch((error) => {
          console.error(error);
          toast.error(error?.response?.data?.error ?? "Couldn't save the header. Check your connection and try again.");
        })
        .finally(() => markSettled("header:save"));
    }, SAVE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [dirty, draft, save]);

  const setText = (field: ResumeHeaderTextField, text: string) => update({ ...draft, [field]: text });

  // In resume mode, `links` absent means "use the profile's links".
  const customLinks = draft.links !== undefined;
  const links = draft.links ?? fallback?.links ?? [];
  const setLinks = (next: ResumeLink[] | undefined) => {
    if (next === undefined) {
      const rest = { ...draft };
      delete rest.links;
      update(rest);
    } else {
      update({ ...draft, links: next });
    }
  };
  const editLink = (index: number, patch: Partial<ResumeLink>) =>
    setLinks(links.map((link, i) => (i === index ? { ...link, ...patch } : link)));

  const textInput = (field: ResumeHeaderTextField, placeholder: string, className: string) => {
    const overridden = isOverride && Boolean(draft[field]?.trim());
    const input = (
      <input
        value={draft[field] ?? ""}
        onChange={(event) => setText(field, event.target.value)}
        placeholder={fallback?.[field] || placeholder}
        aria-label={placeholder}
        className={cn(
          ghostInput,
          "block w-full",
          className,
          // A profile value shown as a placeholder should read as real text.
          fallback?.[field] && "placeholder:text-current placeholder:opacity-100",
          overridden && "text-sky-800"
        )}
      />
    );
    if (!overridden) return input;

    return (
      <Tooltip>
        <TooltipTrigger asChild>{input}</TooltipTrigger>
        <TooltipContent side="right">Only on this resume. Clear it to use your profile.</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <article className="group/header relative mx-auto w-full max-w-2xl bg-white px-10 py-9 shadow-[0_1px_3px_rgba(0,0,0,0.08),0_8px_24px_rgba(0,0,0,0.06)] sm:px-14">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="About the header"
            className="absolute right-4 top-4 rounded-full p-1 text-muted-foreground/70 transition-colors hover:text-foreground"
          >
            <InfoIcon className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-64">
          {isOverride
            ? "Grey text comes from your profile. Type over a field to change it for this resume only."
            : "Your name and contact details, shown at the top of every resume. Each resume can change them."}
        </TooltipContent>
      </Tooltip>

      {textInput("name", "Your name", "py-0.5 text-2xl font-bold")}
      {textInput("headline", "Headline, e.g. Backend engineer", "mt-0.5 py-0.5 text-base text-muted-foreground")}

      <div className="mt-3 grid gap-x-4 gap-y-0.5 text-sm sm:grid-cols-[1.6fr_1fr_1fr]">
        {CONTACT_FIELDS.map(({ field, placeholder }) => (
          <div key={field}>{textInput(field, placeholder, "py-0.5")}</div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
        {isOverride && !customLinks ? (
          <>
            {links.map((link) => (
              <span
                key={`${link.label}-${link.url}`}
                className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-muted-foreground"
              >
                <LinkIcon className="size-3" />
                {link.label || link.url}
              </span>
            ))}
            {links.length === 0 && <span className="text-muted-foreground/70">No links</span>}
            <IconAction label="Use different links on this resume" onClick={() => setLinks(links.map((link) => ({ ...link })))}>
              <PencilIcon />
            </IconAction>
          </>
        ) : (
          <>
            {links.map((link, index) => (
              <span key={index} className="inline-flex items-center gap-1 rounded-full bg-muted/60 py-0.5 pl-2 pr-0.5">
                <LinkIcon className="size-3 shrink-0 text-muted-foreground" />
                <input
                  value={link.label}
                  onChange={(event) => editLink(index, { label: event.target.value })}
                  placeholder="Label"
                  aria-label="Link label"
                  className="field-sizing-content min-w-[5ch] bg-transparent outline-none placeholder:text-muted-foreground/60"
                />
                <input
                  value={link.url}
                  onChange={(event) => editLink(index, { url: event.target.value })}
                  placeholder="github.com/you"
                  aria-label="Link address"
                  className="field-sizing-content min-w-[12ch] max-w-64 bg-transparent text-muted-foreground outline-none placeholder:text-muted-foreground/60"
                />
                <IconAction
                  label="Remove link"
                  className="size-6"
                  onClick={() => setLinks(links.filter((_, i) => i !== index))}
                >
                  <XIcon />
                </IconAction>
              </span>
            ))}
            {links.length < MAX_LINKS && (
              <IconAction label="Add a link" onClick={() => setLinks([...links, { label: "", url: "" }])}>
                <PlusIcon />
              </IconAction>
            )}
            {isOverride && (
              <IconAction label="Use your profile's links again" onClick={() => setLinks(undefined)}>
                <RotateCcwIcon />
              </IconAction>
            )}
          </>
        )}
      </div>
    </article>
  );
};

export default HeaderDocument;
