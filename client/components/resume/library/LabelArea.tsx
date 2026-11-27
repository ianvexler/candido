"use client";

import { Checkbox } from "@/components/ui/Checkbox";
import type { LabelTarget } from "@/api/resources/cvLabels/setLabelOnItems";
import { ITEM_ATTRIBUTE, listItems } from "@/lib/resume/items";
import { inFilter, labelsOf, PurposeFilter } from "@/lib/resume/purposes";
import { CvLabel, SectionTemplate } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { Editor } from "@tiptap/react";
import { TagIcon } from "lucide-react";
import { FocusEvent as ReactFocusEvent, KeyboardEvent, PointerEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { offerableItem } from "../LeaveOutArea";
import { LEAVE_OUT_SPACE } from "../styles";
import LabelPicker from "./LabelPicker";

/** Labelling a library section's content: see SectionDocument. */
export interface LibraryLabelling {
  labels: CvLabel[];
  /** The section's labels by entry or item id. */
  itemLabels: Record<string, number[]>;
  filter: PurposeFilter;
  /** Item ids. */
  selected: ReadonlySet<string>;
  onToggleSelect: (entryId: string, itemId: string) => void;
  /** Says what went wrong itself. */
  onLabel: (labelId: number, on: boolean, targets: LabelTarget[]) => Promise<void>;
  onCreate: (name: string) => Promise<CvLabel>;
}

export type Chip = { name: string; fromEntry: boolean };

const EVERY_PURPOSE: Chip[] = [{ name: "Every purpose", fromEntry: false }];

/** The item's own labels, then its entry's; "Every purpose" with none. */
export const labelChips = (labels: CvLabel[], { own, inherited }: { own: number[]; inherited: number[] }): Chip[] => {
  const name = (id: number) => labels.find((label) => label.id === id)?.name;
  const chips = [
    ...own.map((id) => ({ name: name(id), fromEntry: false })),
    ...inherited.filter((id) => !own.includes(id)).map((id) => ({ name: name(id), fromEntry: true })),
  ].filter((chip): chip is Chip => chip.name !== undefined);
  return chips.length > 0 ? chips : EVERY_PURPOSE;
};

// What the server accepts as an id, so it can go in a selector as it is.
const VALID_ID = /^[\w-]{1,64}$/;

const ruleFor = (sectionId: number, ids: string[], declarations: string) =>
  ids.length === 0
    ? ""
    : `[data-section-id="${sectionId}"] :is(${ids.map((id) => `[${ITEM_ATTRIBUTE}="${id}"]`).join(", ")}) { ${declarations} }`;

/** Dims, within the section, the items that the filter leaves out. Their text is as it was. */
export const dimmingRule = (
  sectionId: number,
  template: Pick<SectionTemplate, "entries" | "item_labels">,
  filter: PurposeFilter
): string => {
  if (filter.kind === "all") return "";
  const ids = template.entries.flatMap((entry) =>
    listItems(entry.content ?? "")
      .map((item) => item.id)
      .filter((id) => VALID_ID.test(id) && !inFilter(template, entry.id, id, filter))
  );
  return ruleFor(sectionId, ids, "opacity: 0.45;");
};

const selectionRule = (sectionId: number, selected: ReadonlySet<string>) =>
  ruleFor(
    sectionId,
    [...selected].filter((id) => VALID_ID.test(id)),
    "background-color: color-mix(in oklab, var(--primary) 9%, transparent); border-radius: 4px;"
  );

/** What is dimmed and what is selected, by item id. Goes inside the section. */
export const LabelStyles = ({
  sectionId,
  entries,
  library,
}: {
  sectionId: number;
  entries: SectionTemplate["entries"];
  library: LibraryLabelling;
}) => {
  const { itemLabels, filter, selected } = library;
  const dimmed = useMemo(
    () => dimmingRule(sectionId, { entries, item_labels: itemLabels }, filter),
    [sectionId, entries, itemLabels, filter]
  );
  const css = [dimmed, selectionRule(sectionId, selected)].filter(Boolean).join("\n");
  return css ? <style>{css}</style> : null;
};

const ITEM_SELECTOR = `[${ITEM_ATTRIBUTE}]`;

type Place = { id: string; top: number };

const caretItem = (editor: Editor): Element | null => {
  const { node } = editor.view.domAtPos(editor.state.selection.from);
  return offerableItem(node instanceof Element ? node : node.parentElement);
};

const samePlace = (a: Place | null, b: Place | null) => a?.id === b?.id && a?.top === b?.top;

interface LabelAreaProps {
  editor: Editor;
  sectionId: number;
  entryId: string;
  library: LibraryLabelling;
  /** A suggestion's card is open, which Escape closes. */
  cardOpen: boolean;
  children: ReactNode;
}

/**
 * Shows, above the item that is pointed at or has the caret, its labels, a box
 * to select it and the Labels button. Placed as LeaveOutArea places "Leave out";
 * none of it is part of the document. Escape moves from the text to Labels and back.
 */
const LabelArea = ({ editor, sectionId, entryId, library, cardOpen, children }: LabelAreaProps) => {
  const { labels, itemLabels, filter, selected, onToggleSelect, onLabel, onCreate } = library;
  const areaRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [hovered, setHovered] = useState<Place | null>(null);
  const [caret, setCaret] = useState<Place | null>(null);
  // While the picker is open it stays with its item.
  const [pinned, setPinned] = useState<Place | null>(null);
  const place = pinned ?? hovered ?? caret;

  const placeOf = useCallback((item: Element | null): Place | null => {
    const area = areaRef.current;
    const id = item?.getAttribute(ITEM_ATTRIBUTE);
    if (!area || !item || !id) return null;
    return { id, top: Math.round(item.getBoundingClientRect().top - area.getBoundingClientRect().top) };
  }, []);

  const showCaret = useCallback(() => {
    if (editor.isDestroyed) return;
    const next = editor.isFocused ? placeOf(caretItem(editor)) : null;
    setCaret((now) => (samePlace(now, next) ? now : next));
  }, [editor, placeOf]);

  useEffect(() => {
    const onEdit = () => {
      showCaret();
      // What is pointed at may have moved.
      setHovered(null);
    };
    const onBlur = ({ event }: { event: FocusEvent }) => {
      // The controls themselves may be what took focus.
      if (!areaRef.current?.contains(event.relatedTarget as Node | null)) setCaret(null);
    };
    editor.on("selectionUpdate", showCaret);
    editor.on("focus", showCaret);
    editor.on("update", onEdit);
    editor.on("blur", onBlur);
    return () => {
      editor.off("selectionUpdate", showCaret);
      editor.off("focus", showCaret);
      editor.off("update", onEdit);
      editor.off("blur", onBlur);
    };
  }, [editor, showCaret]);

  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerType !== "mouse" || event.buttons > 0) return;
    const target = event.target as Element;
    // Between items, or on the controls: as it was.
    if (!target.closest(ITEM_SELECTOR)) return;
    const next = placeOf(offerableItem(target));
    setHovered((now) => (samePlace(now, next) ? now : next));
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (cardOpen || event.key !== "Escape" || event.nativeEvent.isComposing) return;
    // From the picker, which is elsewhere in the page, Escape only closes it.
    if (!areaRef.current?.contains(event.target as Node)) return;
    if (event.target !== editor.view.dom && !editor.view.dom.contains(event.target as Node)) {
      editor.commands.focus();
    } else if (caret) {
      // It is the caret's item that is meant.
      setHovered(null);
      requestAnimationFrame(() => buttonRef.current?.focus());
    }
  };

  const onControlBlur = (event: ReactFocusEvent) => {
    if (!areaRef.current?.contains(event.relatedTarget)) setCaret(null);
  };

  const openPicker = (open: boolean) => {
    if (open) {
      setPinned(place);
      return;
    }
    // Focus comes back to Labels, so it stays until that leaves.
    setCaret(pinned);
    setPinned(null);
  };

  const labelled = place ? labelsOf({ item_labels: itemLabels }, entryId, place.id) : null;

  return (
    <div
      ref={areaRef}
      className={cn("relative", LEAVE_OUT_SPACE)}
      onPointerMove={onPointerMove}
      onPointerLeave={() => setHovered(null)}
      // Before the card closes, so it counts as open.
      onKeyDownCapture={onKeyDown}
    >
      {children}
      {place && labelled && (
        <div
          style={{ top: place.top }}
          className="absolute right-0 z-10 flex max-w-full -translate-y-full items-center gap-1 rounded-md bg-white/95 py-0.5 pl-1.5 pr-0.5 text-[11px] leading-tight shadow-sm ring-1 ring-border"
        >
          <ul aria-label="Labels of this item" className="flex min-w-0 items-center gap-1 overflow-hidden">
            {labelChips(labels, labelled).map((chip) => (
              <li
                key={`${chip.name}:${chip.fromEntry}`}
                className={cn(
                  "max-w-32 shrink-0 truncate rounded-sm px-1 py-px",
                  chip.fromEntry ? "border border-dashed border-border text-muted-foreground" : "bg-muted"
                )}
              >
                {chip.name}
                {chip.fromEntry && <span className="text-muted-foreground">, from entry</span>}
              </li>
            ))}
          </ul>
          <span className="flex shrink-0 items-center [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 [@media(pointer:coarse)]:justify-center">
            <Checkbox
              aria-label="Select"
              checked={selected.has(place.id)}
              // Keeps the caret where it is.
              onMouseDown={(event) => event.preventDefault()}
              onCheckedChange={() => onToggleSelect(entryId, place.id)}
              onBlur={onControlBlur}
            />
          </span>
          <LabelPicker
            labels={labels}
            filter={filter}
            mode={{ kind: "toggle", ...labelled }}
            onChoose={(labelId, on) => onLabel(labelId, on, [{ section_template_id: sectionId, id: place.id }])}
            onCreate={onCreate}
            open={pinned !== null}
            onOpenChange={openPicker}
            title="Labels of this item"
          >
            <button
              ref={buttonRef}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onBlur={(event) => {
                if (pinned === null) onControlBlur(event);
              }}
              className="flex shrink-0 items-center gap-1 rounded-sm px-1 py-0.5 text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [@media(pointer:coarse)]:min-h-11"
            >
              <TagIcon className="size-3" aria-hidden />
              Labels
            </button>
          </LabelPicker>
        </div>
      )}
    </div>
  );
};

export default LabelArea;
