"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import type { HeaderDraft } from "@/lib/resume/useHeaderDraft";
import { ResumeHeaderTextField } from "@/lib/types";
import { cn } from "@/lib/utils";
import { LinkIcon, PencilIcon, PlusIcon, RotateCcwIcon, XIcon } from "lucide-react";
import type { MouseEvent } from "react";
import IconAction from "./IconAction";
import { ghostInput } from "./styles";

const MAX_LINKS = 10;

const CONTACT_FIELDS: { field: ResumeHeaderTextField; placeholder: string }[] = [
  { field: "email", placeholder: "Email" },
  { field: "phone", placeholder: "Phone" },
  { field: "location", placeholder: "Location" },
];

// Above the rest of the sheet's fields; a card has none but these.
const CARD_FIELDS: typeof CONTACT_FIELDS = [
  { field: "name", placeholder: "Name" },
  { field: "headline", placeholder: "Headline" },
  ...CONTACT_FIELDS,
];

interface HeaderTextProps {
  header: HeaderDraft;
  field: ResumeHeaderTextField;
  placeholder: string;
  className: string;
  /** Says under it what an overridden one is, rather than in a tooltip. */
  inCard?: boolean;
}

export const HeaderText = ({ header, field, placeholder, className, inCard = false }: HeaderTextProps) => {
  const { draft, fallback, setText } = header;
  const overridden = header.isOverridden(field);
  const input = (
    <input
      data-field={field}
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
  // The input stays the same element as it becomes overridden, or it would lose the focus.
  if (inCard) {
    return (
      <>
        {input}
        {overridden && (
          <OnlyHere
            what={placeholder.toLowerCase()}
            onUndo={(event) => {
              // It goes away itself.
              event.currentTarget.closest("[data-header-field]")?.querySelector("input")?.focus();
              setText(field, "");
            }}
          />
        )}
      </>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>{input}</TooltipTrigger>
      {overridden && <TooltipContent side="right">Only on this CV. Clear it to use your profile.</TooltipContent>}
    </Tooltip>
  );
};

interface OnlyHereProps {
  what: string;
  onUndo: (event: MouseEvent) => void;
}

const OnlyHere = ({ what, onUndo }: OnlyHereProps) => (
  <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
    Only on this CV
    <button
      type="button"
      onClick={onUndo}
      aria-label={`Use your profile: ${what}`}
      className="rounded-sm text-foreground underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      Use your profile
    </button>
  </p>
);

/** The contact details and links, as fields. A card has the name and headline too. */
export const HeaderFields = ({ header, inCard = false }: { header: HeaderDraft; inCard?: boolean }) => {
  const { links, setLinks, editLink } = header;
  const isOverride = header.fallback !== undefined;
  // In resume mode, `links` absent means "use the profile's links".
  const customLinks = header.draft.links !== undefined;

  return (
    <>
      <div className={cn("grid gap-x-4 gap-y-0.5 text-sm", inCard ? "gap-y-2" : "mt-3 sm:grid-cols-[1.6fr_1fr_1fr]")}>
        {(inCard ? CARD_FIELDS : CONTACT_FIELDS).map(({ field, placeholder }) => (
          <div key={field} data-header-field>
            {inCard && (
              <span aria-hidden className="text-xs text-muted-foreground">
                {placeholder}
              </span>
            )}
            <HeaderText header={header} field={field} placeholder={placeholder} className="py-0.5" inCard={inCard} />
          </div>
        ))}
      </div>

      <div data-field="links" className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
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
            <IconAction label="Use different links on this CV" onClick={() => setLinks(links.map((link) => ({ ...link })))}>
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
            {isOverride && !inCard && (
              <IconAction label="Use your profile's links again" onClick={() => setLinks(undefined)}>
                <RotateCcwIcon />
              </IconAction>
            )}
          </>
        )}
      </div>

      {inCard && header.isOverridden("links") && (
        <OnlyHere
          what="links"
          onUndo={(event) => {
            event.currentTarget.closest<HTMLElement>("[role=dialog]")?.focus();
            setLinks(undefined);
          }}
        />
      )}
    </>
  );
};
