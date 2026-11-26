"use client";

import type { ChecklistSection } from "@/lib/resume/checklist";
import type { ChecklistActions, ChecklistTarget } from "@/lib/resume/useCvChecklist";
import { CurriculumSection, SUMMARY_ID } from "@/lib/types";
import { cn } from "@/lib/utils";
import { autoUpdate, flip, FloatingPortal, offset, shift, useFloating } from "@floating-ui/react";
import { CheckIcon } from "lucide-react";
import { ReactNode, Ref, RefObject, useEffect, useEffectEvent, useImperativeHandle, useState } from "react";
import { textStart } from "../ChecklistRow";
import IconAction from "../IconAction";
import type { CvEdits } from "../useCvEdits";
import AddMenu from "./AddMenu";
import { columnsOf } from "./measureBlocks";
import { BlockRef, blockAt, columnEdges, Gap, gapAt } from "./pagePlaces";
import SectionMenu from "./SectionMenu";

/** Sizes in sheet px. */
const TICK = 18;
const PILL = 20;
/** Room between a margin tool and its column's text. */
const ROOM = 4;
/** A "+ Section" sits below a "+ Add" of the same gap, as the lower half of it. */
const SECTION_DROP = 4;

type Block = BlockRef & { top: number; left: number };
type Hovered = { block: Block | null; gap: Gap | null };
type AddGap = Extract<Gap, { kind: "add" }>;
type Menu = { kind: "add"; gap: AddGap } | { kind: "section"; gap: Gap; afterSectionId: number | null };

const NOTHING: Hovered = { block: null, gap: null };

/** What a keyboard shortcut opens. */
export type PageToolsHandle = {
  openAdd: (gap: AddGap) => void;
  /** At `at`, or above the section after the given one. */
  openSection: (afterSectionId: number | null, at?: Gap) => void;
};

const targetOf = (block: BlockRef): ChecklistTarget => {
  const { sectionId } = block;
  const target: ChecklistTarget = { sectionId, templateId: null, inCv: true };
  if (block.kind === "heading") return target;
  if (block.kind === "entry") return { ...target, entryId: block.entryId };
  return { ...target, entryId: block.entryId, itemId: block.kind === "item" ? block.itemId : SUMMARY_ID };
};

const nameOf = (rows: ChecklistSection[], block: BlockRef) => {
  const row = rows.find(({ sectionId }) => sectionId === block.sectionId);
  if (block.kind === "heading") return row?.name || "this section";
  const entry = row?.entries.find(({ id }) => id === block.entryId);
  if (block.kind === "entry") return entry?.title || "this entry";
  const itemId = block.kind === "item" ? block.itemId : SUMMARY_ID;
  return entry?.items.find(({ id }) => id === itemId)?.text || (block.kind === "summary" ? "the summary" : "this");
};

const same = (a: Hovered, b: Hovered) => JSON.stringify(a) === JSON.stringify(b);

/** Where a "+ Section" for after a section goes when no gap was pointed at: above the next one. */
const sectionGap = (root: HTMLElement, scale: number, order: number[], afterSectionId: number | null): Gap | null => {
  const next = afterSectionId === null ? order[0] : order[order.indexOf(afterSectionId) + 1];
  const below = next === undefined ? null : root.querySelector(`[data-section-id="${next}"]`);
  const above = afterSectionId === null ? null : root.querySelector(`[data-section-id="${afterSectionId}"]`);
  const at = below ?? above;
  const column = at && columnsOf(root).find((each) => each.contains(at));
  if (!at || !column) return null;
  const box = at.getBoundingClientRect();
  const top = ((below ? box.top : box.bottom) - root.getBoundingClientRect().top) / scale;
  return { kind: "section", afterSectionId, top, ...columnEdges(root, scale, column) };
};

interface ToolMenuProps {
  anchor: Element | null;
  onClose: (back: boolean) => void;
  /** What else a press on keeps it open: what opens another in its place. */
  keepOpenOn?: string;
  children: ReactNode;
}

/** A menu by its pill, out of the page's scale. A press elsewhere closes it. */
export const ToolMenu = ({ anchor, onClose, keepOpenOn, children }: ToolMenuProps) => {
  const { refs, floatingStyles, elements } = useFloating({
    placement: "bottom-start",
    elements: { reference: anchor },
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });
  const close = useEffectEvent(onClose);
  const { floating } = elements;
  const { setFloating } = refs;
  useEffect(() => {
    const onDown = ({ target }: PointerEvent) => {
      if (!(target instanceof Node) || floating?.contains(target) || anchor?.contains(target)) return;
      if (keepOpenOn && target instanceof Element && target.closest(keepOpenOn)) return;
      close(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [floating, anchor, keepOpenOn]);

  return (
    <FloatingPortal>
      <div
        ref={setFloating}
        style={floatingStyles}
        className="z-30 rounded-[10px] border border-border bg-background p-1.5 text-[13px] text-foreground shadow-lg print:hidden"
      >
        {children}
      </div>
    </FloatingPortal>
  );
};

interface PillProps {
  gap: Gap;
  open: boolean;
  onOpen: () => void;
  buttonRef?: (element: HTMLButtonElement | null) => void;
}

/** An add point: the pill and its line across the gap. Neither takes room. */
const Pill = ({ gap, open, onOpen, buttonRef }: PillProps) => {
  const { left, right } = gap;
  const pill = "absolute h-5 whitespace-nowrap rounded-full border px-2 text-xs/[18px] font-medium shadow-[0_2px_8px_-3px_rgb(0_0_0/0.25)]";
  if (gap.kind === "add") {
    return (
      <>
        <div aria-hidden className="pointer-events-none absolute h-[1.5px] bg-[#f5a524]" style={{ top: gap.top - 0.75, left, width: right - left }} />
        <button
          ref={buttonRef}
          type="button"
          aria-label="Add here"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={onOpen}
          className={cn(pill, "-translate-x-full border-[#aab2ba] bg-white text-[#1f2328] hover:border-[#f5a524] hover:bg-[#fff4dc]", open && "border-[#f5a524] bg-[#fff4dc]")}
          style={{ top: gap.top - PILL / 2, left: left - ROOM }}
        >
          + Add
        </button>
      </>
    );
  }
  const top = gap.top + SECTION_DROP;
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute border-t-[1.5px] border-dashed border-[#1f2328]"
        style={{ top: top - 0.75, left, width: right - left }}
      />
      <button
        ref={buttonRef}
        type="button"
        aria-label="Add a section"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={onOpen}
        className={cn(pill, "-translate-x-1/2 border-[#1f2328] bg-[#1f2328] font-semibold tracking-[0.02em] text-white hover:bg-[#3a4047]")}
        style={{ top: top - PILL / 2, left: (left + right) / 2 }}
      >
        + Section
      </button>
    </>
  );
};

/** What the tools do, from the CV's checklist. */
export type PageToolsActions = {
  rows: ChecklistSection[];
  actions: ChecklistActions;
  edits: CvEdits;
  addSection: (name: string, afterSectionId: number | null) => Promise<void>;
};

interface PageToolsProps extends PageToolsActions {
  ref?: Ref<PageToolsHandle>;
  /** The page's root: what prints. Nothing is put in it. */
  rootRef: RefObject<HTMLElement | null>;
  scale: number;
  sections: CurriculumSection[];
}

/**
 * The tick and add point under the pointer, over the page's margins and gaps.
 * Placed in the page's scaled box, beside the page, in sheet units.
 */
const PageTools = ({ ref, rootRef, scale, sections, rows, actions, edits, addSection }: PageToolsProps) => {
  const [hovered, setHovered] = useState<Hovered>(NOTHING);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const order = sections.map(({ id }) => id);

  const find = useEffectEvent((event: PointerEvent): Hovered | null => {
    const root = rootRef.current;
    const target = event.target instanceof Element ? event.target : null;
    if (!root || !target) return NOTHING;
    // Over a tool: what it is for stays.
    if (target.closest("[data-page-tools]")) return null;
    // Selecting, or a finger: no hover.
    if (event.buttons !== 0 || event.pointerType === "touch") return NOTHING;
    const found = blockAt(root, scale, target);
    const column = found && columnsOf(root).find((each) => each.contains(target));
    const block = found && column ? { ...found, left: columnEdges(root, scale, column).left } : null;
    return { block, gap: gapAt(root, scale, event.clientX, event.clientY, order) };
  });

  useEffect(() => {
    const area = rootRef.current?.parentElement;
    if (!area) return;
    let frame = 0;
    let last: PointerEvent | null = null;
    const update = () => {
      frame = 0;
      const next = last && find(last);
      if (next) setHovered((before) => (same(before, next) ? before : next));
    };
    const onMove = (event: PointerEvent) => {
      last = event;
      if (!frame) frame = requestAnimationFrame(update);
    };
    const clear = () => {
      last = null;
      setHovered(NOTHING);
    };
    area.addEventListener("pointermove", onMove);
    // What is typed may move the text from under them. Once: nothing is done per key.
    const onKey = () => {
      if (last) clear();
    };
    area.addEventListener("pointerleave", clear);
    area.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      area.removeEventListener("pointermove", onMove);
      area.removeEventListener("pointerleave", clear);
      area.removeEventListener("keydown", onKey);
    };
  }, [rootRef]);

  const close = (back: boolean) => {
    setMenu(null);
    setHovered(NOTHING);
    if (back) rootRef.current?.focus({ preventScroll: true });
  };

  const open = (gap: Gap) =>
    setMenu(gap.kind === "add" ? { kind: "add", gap } : { kind: "section", gap, afterSectionId: gap.afterSectionId });

  useImperativeHandle(ref, () => ({
    openAdd: (gap) => setMenu({ kind: "add", gap }),
    openSection: (afterSectionId, at) => {
      const root = rootRef.current;
      const gap = at ?? (root && sectionGap(root, scale, order, afterSectionId));
      if (gap) setMenu({ kind: "section", gap, afterSectionId });
    },
  }));

  const { block, gap } = menu ? NOTHING : hovered;
  // In the margin both would be in one place: by a gap, the pill is what is pointed at.
  const clash = block && gap?.kind === "add" && Math.abs(block.top + TICK / 2 - gap.top) < (TICK + PILL) / 2;
  const shownGap = menu?.gap ?? gap;

  return (
    // Over the sidebar template's columns, which are stacked.
    <div data-page-tools className="print:hidden [&>*]:z-10">
      {block && !clash && (
        <IconAction
          label={`Leave out ${textStart(nameOf(rows, block))}`}
          side="left"
          onClick={() => {
            setHovered(NOTHING);
            void actions.tick(targetOf(block), false);
            rootRef.current?.focus({ preventScroll: true });
          }}
          className="absolute size-[18px] min-w-0 rounded-[4px] bg-[#1f2328] p-0 text-white hover:bg-[#3a4047] hover:text-white [&_svg]:size-3"
          style={{ top: block.top - 1, left: block.left - ROOM - TICK }}
        >
          <CheckIcon strokeWidth={3} />
        </IconAction>
      )}
      {shownGap && (
        <Pill gap={shownGap} open={menu !== null} onOpen={() => (menu ? close(false) : open(shownGap))} buttonRef={setAnchor} />
      )}
      {menu?.kind === "add" && (
        <ToolMenu anchor={anchor} onClose={close}>
          <AddMenu
            place={menu.gap.place}
            sections={sections}
            edits={edits}
            onPutBack={(entryId, itemId) =>
              void actions.tick({ sectionId: menu.gap.place.sectionId, templateId: null, entryId, itemId, inCv: true }, true)
            }
            onClose={close}
          />
        </ToolMenu>
      )}
      {menu?.kind === "section" && (
        <ToolMenu anchor={anchor} onClose={close}>
          <SectionMenu
            rows={rows}
            order={order}
            afterSectionId={menu.afterSectionId}
            actions={actions}
            addSection={addSection}
            onClose={close}
          />
        </ToolMenu>
      )}
    </div>
  );
};

export default PageTools;
