"use client";

import { ChecklistSection, placeSection } from "@/lib/resume/checklist";
import type { ChecklistActions } from "@/lib/resume/useCvChecklist";
import type { CurriculumSection } from "@/lib/types";
import { cn } from "@/lib/utils";
import { KeyboardEvent, useCallback, useEffect, useId, useRef, useState } from "react";

type Waiting = { templateId: number; afterSectionId: number | null; known: Set<number> };

/**
 * Orders a library section after another once its copy is in the CV: an include
 * says nothing of where it went, and appends it.
 */
export const useOrderWhenIn = (sections: CurriculumSection[], orderSections: ChecklistActions["orderSections"]) => {
  const waiting = useRef<Waiting | null>(null);
  const latest = useRef(sections);
  useEffect(() => {
    latest.current = sections;
    const wanted = waiting.current;
    const copy = wanted && sections.find((section) => section.section_template_id === wanted.templateId && !wanted.known.has(section.id));
    if (!wanted || !copy) return;
    waiting.current = null;
    orderSections(placeSection(sections.map(({ id }) => id), copy.id, wanted.afterSectionId));
  }, [sections, orderSections]);
  return useCallback((templateId: number, afterSectionId: number | null) => {
    waiting.current = { templateId, afterSectionId, known: new Set(latest.current.map(({ id }) => id)) };
  }, []);
};

type Choice =
  | { kind: "cv"; row: ChecklistSection & { sectionId: number } }
  | { kind: "library"; row: ChecklistSection & { templateId: number } }
  | { kind: "new"; name: string }
  | { kind: "blank" };

const entries = (count: number) => (count === 1 ? "1 entry" : `${count} entries`);

interface SectionMenuProps {
  rows: ChecklistSection[];
  /** The CV's section ids, in order. */
  order: number[];
  afterSectionId: number | null;
  actions: Pick<ChecklistActions, "tick" | "orderSections">;
  addSection: (name: string, afterSectionId: number | null) => Promise<void>;
  orderWhenIn: ReturnType<typeof useOrderWhenIn>;
  /** `back`: the focus goes back to the page. */
  onClose: (back: boolean) => void;
}

/** What a "+ Section" adds: a left-out or library section, or a new one, searched by name. */
const SectionMenu = ({ rows, order, afterSectionId, actions, addSection, orderWhenIn, onClose }: SectionMenuProps) => {
  const listId = useId();
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  // Not autoFocus: the menu may not be placed yet, and the page would scroll to it.
  useEffect(() => inputRef.current?.focus({ preventScroll: true }), []);

  const query = text.trim().toLowerCase();
  const matches = ({ name }: ChecklistSection) => name.toLowerCase().includes(query);
  const found: Choice[] = [
    ...rows
      .filter((row): row is Extract<Choice, { kind: "cv" }>["row"] => row.sectionId !== null && !row.ticked && matches(row))
      .map((row) => ({ kind: "cv" as const, row })),
    ...rows
      .filter((row): row is Extract<Choice, { kind: "library" }>["row"] => row.sectionId === null && row.templateId !== null && matches(row))
      .map((row) => ({ kind: "library" as const, row })),
  ];
  const choices: Choice[] = [...found, ...(found.length === 0 && query ? [{ kind: "new" as const, name: text.trim() }] : []), { kind: "blank" }];
  const at = Math.min(active, choices.length - 1);

  const choose = (choice: Choice) => {
    onClose(false);
    if (choice.kind === "cv") {
      const { sectionId, templateId } = choice.row;
      actions.tick({ sectionId, templateId, inCv: true }, true);
      actions.orderSections(placeSection(order, sectionId, afterSectionId));
    } else if (choice.kind === "library") {
      actions.tick({ sectionId: null, templateId: choice.row.templateId, inCv: false }, true);
      orderWhenIn(choice.row.templateId, afterSectionId);
    } else {
      void addSection(choice.kind === "new" ? choice.name : "Section", afterSectionId);
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const by = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (by !== undefined) {
      event.preventDefault();
      setActive((at + by + choices.length) % choices.length);
    } else if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      choose(choices[at]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      // Not for a card or editor beneath.
      event.stopPropagation();
      onClose(true);
    }
  };

  const optionId = (index: number) => `${listId}-${index}`;
  const label = (choice: Choice) => {
    if (choice.kind === "new") return `New section “${choice.name}”`;
    if (choice.kind === "blank") return "Blank section";
    return choice.row.name;
  };

  return (
    <div className="w-72">
      <input
        ref={inputRef}
        role="combobox"
        aria-expanded
        aria-controls={listId}
        aria-activedescendant={optionId(at)}
        aria-label="Search your sections"
        placeholder="Search your sections…"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        className="mb-1 w-full rounded-[7px] border border-border px-2.5 py-1.5 text-[13px] outline-none focus-visible:border-[#f5a524]"
      />
      <div id={listId} role="listbox" aria-label="Sections" className="max-h-72 overflow-y-auto">
        {choices.map((choice, index) => (
          <div
            key={choice.kind === "cv" || choice.kind === "library" ? choice.row.key : choice.kind}
            id={optionId(index)}
            role="option"
            aria-selected={index === at}
            // The search keeps the focus.
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => setActive(index)}
            onClick={() => choose(choice)}
            className={cn(
              "flex cursor-pointer items-baseline gap-2 rounded-md px-2 py-1.5",
              choice.kind === "blank" && "mt-1 border-t border-border",
              index === at && "bg-[#fff4dc]"
            )}
          >
            <span className="min-w-0 truncate">{label(choice)}</span>
            {(choice.kind === "cv" || choice.kind === "library") && (
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">{entries(choice.row.entries.length)}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default SectionMenu;
