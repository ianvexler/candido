"use client";

import { Button } from "@/components/ui/Button";
import InlineInput from "@/components/ui/InlineInput";
import { cn } from "@/lib/utils";
import { ResumeHeader, ResumeHeaderTextField, ResumeLink } from "@/lib/types";
import { LinkIcon, PlusIcon, XIcon } from "lucide-react";
import NextLink from "next/link";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

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

  useEffect(() => {
    if (dirty === 0) return;

    const timer = setTimeout(() => {
      setDirty(0);
      void save(draft).catch((error) => {
        console.error(error);
        toast.error(error?.response?.data?.error ?? "Failed to save header");
      });
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
    return (
      <InlineInput
        value={draft[field] ?? ""}
        onChange={(event) => setText(field, event.target.value)}
        placeholder={fallback?.[field] || placeholder}
        aria-label={placeholder}
        title={overridden ? "Custom for this resume. Clear it to use your profile." : undefined}
        className={cn("border-0", className, overridden && "text-sky-900")}
      />
    );
  };

  return (
    <article className="mx-auto w-full max-w-2xl bg-white px-10 py-10 shadow-[0_1px_3px_rgba(0,0,0,0.08),0_8px_24px_rgba(0,0,0,0.06)] sm:px-14">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Header</p>
        {isOverride && (
          <p className="text-xs text-muted-foreground">
            Blank fields use your{" "}
            <NextLink href="/resume/sections" className="underline underline-offset-2">
              profile
            </NextLink>
            .
          </p>
        )}
      </div>

      {textInput("name", "Your name", "py-1 text-2xl font-bold")}
      {textInput("headline", "Headline, e.g. Backend engineer", "py-1 text-base text-muted-foreground")}

      <div className="mt-3 grid gap-x-4 sm:grid-cols-[1.6fr_1fr_1fr]">
        {CONTACT_FIELDS.map(({ field, placeholder }) => (
          <div key={field}>{textInput(field, placeholder, "py-1 text-sm")}</div>
        ))}
      </div>

      <div className="mt-4 space-y-1">
        {isOverride && !customLinks ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {links.length > 0 ? (
              links.map((link) => (
                <span key={`${link.label}-${link.url}`} className="inline-flex items-center gap-1">
                  <LinkIcon className="size-3" />
                  {link.label || link.url}
                </span>
              ))
            ) : (
              <span>No links in your profile.</span>
            )}
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setLinks(links.map((link) => ({ ...link })))}
            >
              Change for this resume
            </Button>
          </div>
        ) : (
          <>
            {links.map((link, index) => (
              <div key={index} className="flex items-center gap-2">
                <LinkIcon className="size-3.5 shrink-0 text-muted-foreground" />
                <InlineInput
                  value={link.label}
                  onChange={(event) => editLink(index, { label: event.target.value })}
                  placeholder="Label"
                  aria-label="Link label"
                  className="w-32 shrink-0 py-1 text-sm"
                />
                <InlineInput
                  value={link.url}
                  onChange={(event) => editLink(index, { url: event.target.value })}
                  placeholder="github.com/you"
                  aria-label="Link URL"
                  className="min-w-0 flex-1 py-1 text-sm"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setLinks(links.filter((_, i) => i !== index))}
                  aria-label="Remove link"
                >
                  <XIcon />
                </Button>
              </div>
            ))}
            <div className="flex items-center gap-1">
              {links.length < MAX_LINKS && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => setLinks([...links, { label: "", url: "" }])}
                >
                  <PlusIcon />
                  Add link
                </Button>
              )}
              {isOverride && (
                <Button type="button" variant="ghost" size="xs" onClick={() => setLinks(undefined)}>
                  Use profile links
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </article>
  );
};

export default HeaderDocument;
