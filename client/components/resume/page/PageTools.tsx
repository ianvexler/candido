"use client";

import type { ChecklistSection } from "@/lib/resume/checklist";
import type { ChecklistActions, ChecklistTarget } from "@/lib/resume/useCvChecklist";
import { CurriculumSection, SUMMARY_ID } from "@/lib/types";
import { cn } from "@/lib/utils";
import { autoUpdate, flip, FloatingPortal, offset, shift, useFloating } from "@floating-ui/react";
import { CheckIcon, PlusIcon } from "lucide-react";
import { ReactNode, Ref, RefObject, useEffect, useEffectEvent, useImperativeHandle, useRef, useState } from "react";
import { textStart } from "../ChecklistRow";
import IconAction from "../IconAction";
import type { AddPlace, CvEdits } from "../useCvEdits";
import AddMenu from "./AddMenu";
import { HAIR, MARK_SIZE } from "./HiddenTextMarks";
import { columnsOf } from "./measureBlocks";
import { addPlaceOf, BlockRef, blockAt, blockBeside, columnEdges, Gap, gapAt, PlacedBlock } from "./pagePlaces";
import SectionMenu from "./SectionMenu";

/** In screen px: the tools are drawn out of the page's scale. A gutter is two buttons side by side. */
const BUTTON = 24;
const GUTTER = 2 * BUTTON + 2;
/** Room between a gutter and its column's text, and between it and the sheet's edge. */
const ROOM = 4;
const INSET = 2;
/** How long the tools stay after the pointer leaves where they are for. */
export const LINGER = 300;

type Menu = { kind: "add"; block: PlacedBlock; place: AddPlace } | { kind: "section"; gap: Gap; afterSectionId: number | null };

/** What a keyboard shortcut opens. */
export type PageToolsHandle = {
  /** The add menu by a block's gutter: the block, or the one a place adds after. */
  openAdd: (at: BlockRef | AddPlace) => void;
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

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The block a place adds after. */
const blockOfPlace = ({ sectionId, entryId, after }: AddPlace): BlockRef =>
  entryId === null
    ? { sectionId, kind: "heading" }
    : after === null
      ? { sectionId, kind: "entry", entryId }
      : { sectionId, kind: "item", entryId, itemId: after };

/** A block's element on the page, to be placed by. */
const elementOf = (root: HTMLElement, block: BlockRef): Element | null => {
  const section = root.querySelector(`[data-section-id="${block.sectionId}"]`);
  if (!section || block.kind === "heading") return section?.querySelector('.rc-heading, [data-block="heading"]') ?? null;
  const entry = section.querySelector(`[data-entry-id="${CSS.escape(block.entryId)}"]`);
  if (!entry || block.kind === "entry") return entry;
  if (block.kind === "summary") return entry.querySelector(".rc-summary");
  return entry.querySelector(`[data-cv-item="${CSS.escape(block.itemId)}"]`);
};

/** Where the gutter is for: the block and the margin beside it, from the sheet's edge, in sheet units. */
const holds = (block: PlacedBlock, x: number, y: number, sheetWidth: number) =>
  y >= block.top && y <= block.bottom && (block.side === "left" ? x >= 0 && x <= block.right : x >= block.left && x <= sheetWidth);

/** A value shown while pointed at, and for a while after. */
const useLingering = <T,>() => {
  const [value, setValue] = useState<T | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const stop = () => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
  };
  useEffect(() => stop, []);
  return {
    value,
    show: (next: T) => {
      stop();
      setValue((before) => (same(before, next) ? before : next));
    },
    linger: () => {
      if (timer.current !== undefined) return;
      timer.current = window.setTimeout(() => {
        timer.current = undefined;
        setValue(null);
      }, LINGER);
    },
    hide: () => {
      stop();
      setValue(null);
    },
  };
};

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
  return { afterSectionId, top, ...columnEdges(root, scale, column) };
};

interface ToolMenuProps {
  anchor: Element | null;
  onClose: (back: boolean) => void;
  /** What else a press on keeps it open: what opens another in its place. */
  keepOpenOn?: string;
  children: ReactNode;
}

/** A menu by its tool, out of the page's scale. A press elsewhere closes it. */
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

/** What the tools do, from the CV's checklist. */
export type PageToolsActions = {
  rows: ChecklistSection[];
  actions: ChecklistActions;
  edits: CvEdits;
  addSection: (name: string, afterSectionId: number | null) => Promise<void>;
};

/** A mark in a margin, in sheet units: where a gutter can't be too. */
export type Taken = { top: number; side: "left" | "right" };

/** The gutter's middle, in sheet units: by the block's first line, or down past any mark there. */
const gutterAt = (block: PlacedBlock, taken: Taken[], scale: number) => {
  // A mark is at most as tall as a tool on screen.
  const room = Math.max(MARK_SIZE, (BUTTON + 2) / scale);
  let middle = block.top + block.line / 2;
  // Less a hair: a fraction added and taken away may come back a hair short, and find the same mark again.
  const near = () => taken.find(({ top, side }) => side === block.side && Math.abs(top - middle) < room - HAIR);
  for (let mark = near(); mark; mark = near()) middle = mark.top + room;
  return middle;
};

/** The gutter's left, in screen px: by the text, and never past the sheet's edge. */
const gutterLeft = (block: PlacedBlock, scale: number, sheetWidth: number) =>
  block.side === "left"
    ? Math.max(INSET, block.left * scale - ROOM - GUTTER)
    : Math.min(sheetWidth * scale - INSET - GUTTER, block.right * scale + ROOM);

// In px, not rem: the app's rem isn't 16px.
const TOOL = "inline-flex size-[24px] min-w-0 items-center justify-center rounded-md p-0 leading-none shadow-[0_1px_4px_-1px_rgb(0_0_0/0.2)] [&_svg]:size-[14px]";

interface PageToolsProps extends PageToolsActions {
  ref?: Ref<PageToolsHandle>;
  /** The page's root: what prints. Nothing is put in it. */
  rootRef: RefObject<HTMLElement | null>;
  /** The sheets' box on screen, unscaled, that the tools are placed in and the pointer is followed over. */
  areaRef: RefObject<HTMLElement | null>;
  scale: number;
  /** In sheet units. */
  sheetWidth: number;
  sections: CurriculumSection[];
  /** Marks within the margins, which a gutter moves off. */
  taken?: Taken[];
}

/**
 * The gutter by the block under the pointer, and the "+ Section" of the gap between sections.
 * Drawn at screen size in the sheets' unscaled box, placed from sheet units by the scale.
 */
const PageTools = ({ ref, rootRef, areaRef, scale, sheetWidth, sections, taken = [], rows, actions, edits, addSection }: PageToolsProps) => {
  const hovered = useLingering<PlacedBlock>();
  const pointed = useLingering<Gap>();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [aiming, setAiming] = useState(false);
  // Both can be shown at once: a gutter lingers by a gap.
  const [addAnchor, setAddAnchor] = useState<HTMLButtonElement | null>(null);
  const [sectionAnchor, setSectionAnchor] = useState<HTMLButtonElement | null>(null);
  const order = sections.map(({ id }) => id);

  const follow = useEffectEvent((event: PointerEvent) => {
    const root = rootRef.current;
    const target = event.target instanceof Element ? event.target : null;
    if (!root || !target || menu) return;
    // Selecting, or a finger: no hover.
    if (event.buttons !== 0 || event.pointerType === "touch") {
      hovered.hide();
      pointed.hide();
      return;
    }
    const box = root.getBoundingClientRect();
    const x = (event.clientX - box.left) / scale;
    const y = (event.clientY - box.top) / scale;

    const current = hovered.value;
    if (current && (target.closest("[data-page-gutter]") || holds(current, x, y, sheetWidth))) hovered.show(current);
    else {
      const found = (root.contains(target) ? blockAt(root, scale, target) : null) ?? blockBeside(root, scale, event.clientX, event.clientY);
      // Between an entry's lines and its items is no block's.
      if (found && y >= found.top && y <= found.bottom) hovered.show(found);
      else hovered.linger();
    }

    const gap = pointed.value;
    const next = gap && target.closest("[data-page-section]") ? gap : gapAt(root, scale, event.clientX, event.clientY, order);
    if (next) pointed.show(next);
    else pointed.linger();
  });

  const leave = useEffectEvent((now: boolean) => {
    if (now) {
      hovered.hide();
      pointed.hide();
    } else {
      hovered.linger();
      pointed.linger();
    }
  });

  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    let frame = 0;
    let last: PointerEvent | null = null;
    const update = () => {
      frame = 0;
      if (last) follow(last);
    };
    const onMove = (event: PointerEvent) => {
      last = event;
      if (!frame) frame = requestAnimationFrame(update);
    };
    const onLeave = () => {
      last = null;
      leave(false);
    };
    // What is typed may move the text from under them. Once: nothing is done per key.
    const onKey = () => {
      if (!last) return;
      last = null;
      leave(true);
    };
    area.addEventListener("pointermove", onMove);
    area.addEventListener("pointerleave", onLeave);
    area.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      area.removeEventListener("pointermove", onMove);
      area.removeEventListener("pointerleave", onLeave);
      area.removeEventListener("keydown", onKey);
    };
  }, [areaRef]);

  const close = (back: boolean) => {
    setMenu(null);
    setAiming(false);
    hovered.hide();
    pointed.hide();
    if (back) rootRef.current?.focus({ preventScroll: true });
  };

  const openFor = (block: PlacedBlock, place = addPlaceOf(block)) => setMenu({ kind: "add", block, place });

  useImperativeHandle(ref, () => ({
    openAdd: (at) => {
      const root = rootRef.current;
      const place = "kind" in at ? addPlaceOf(at) : at;
      const element = root && elementOf(root, "kind" in at ? at : blockOfPlace(at));
      const block = root && element && blockAt(root, scale, element);
      if (block) openFor(block, place);
    },
    openSection: (afterSectionId, at) => {
      const root = rootRef.current;
      const gap = at ?? (root && sectionGap(root, scale, order, afterSectionId));
      if (gap) setMenu({ kind: "section", gap, afterSectionId });
    },
  }));

  const block = menu?.kind === "add" ? menu.block : menu ? null : hovered.value;
  const gap = menu?.kind === "section" ? menu.gap : menu ? null : pointed.value;
  const adding = menu?.kind === "add";

  return (
    <div data-page-tools className="print:hidden">
      {block && (
        <>
          {(aiming || adding) && (
            <div
              aria-hidden
              data-add-line
              className="pointer-events-none absolute z-20 h-[1.5px] bg-[#f5a524]"
              style={{ top: block.bottom * scale, left: block.left * scale, width: (block.right - block.left) * scale }}
            />
          )}
          <div
            data-page-gutter
            className="pointer-events-auto absolute z-20 flex gap-0.5"
            style={{ top: gutterAt(block, taken, scale) * scale - BUTTON / 2, left: gutterLeft(block, scale, sheetWidth) }}
          >
            <IconAction
              label="Add below"
              // Above: beside, it would cover the other button.
              side="top"
              buttonRef={setAddAnchor}
              aria-haspopup="menu"
              aria-expanded={adding}
              onPointerEnter={() => setAiming(true)}
              onPointerLeave={() => setAiming(false)}
              onClick={() => (adding ? close(false) : openFor(block))}
              className={cn(
                TOOL,
                "border border-[#d5dade] bg-white text-[#5f6770] hover:border-[#aab2ba] hover:bg-white hover:text-[#1f2328]",
                adding && "border-[#f5a524] bg-[#fff4dc] text-[#1f2328] hover:bg-[#fff4dc]"
              )}
            >
              <PlusIcon strokeWidth={2.5} />
            </IconAction>
            <IconAction
              label={`Leave out ${textStart(nameOf(rows, block))}`}
              side="top"
              onClick={() => {
                close(false);
                void actions.tick(targetOf(block), false);
                rootRef.current?.focus({ preventScroll: true });
              }}
              className={cn(TOOL, "bg-[#1f2328] text-white hover:bg-[#3a4047] hover:text-white")}
            >
              <CheckIcon strokeWidth={3} />
            </IconAction>
          </div>
        </>
      )}
      {gap && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute z-20 border-t border-dashed border-[#aab2ba]"
            style={{ top: gap.top * scale - 0.5, left: gap.left * scale, width: (gap.right - gap.left) * scale }}
          />
          <button
            ref={setSectionAnchor}
            type="button"
            data-page-section
            aria-label="Add a section"
            aria-haspopup="listbox"
            aria-expanded={menu?.kind === "section"}
            onClick={() => (menu ? close(false) : setMenu({ kind: "section", gap, afterSectionId: gap.afterSectionId }))}
            className={cn(
              "pointer-events-auto absolute z-20 inline-flex h-[24px] -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-[4px] whitespace-nowrap rounded-full border border-[#aab2ba] bg-white pl-[6px] pr-[10px] text-[12px] font-medium leading-none text-[#1f2328] hover:border-[#5f6770] hover:text-black [&_svg]:size-[14px]",
              menu?.kind === "section" && "border-[#5f6770] text-black"
            )}
            style={{ top: gap.top * scale, left: ((gap.left + gap.right) / 2) * scale }}
          >
            <PlusIcon strokeWidth={2.5} />
            Section
          </button>
        </>
      )}
      {menu?.kind === "add" && (
        <ToolMenu anchor={addAnchor} onClose={close} keepOpenOn="[data-page-gutter]">
          <AddMenu
            place={menu.place}
            sections={sections}
            edits={edits}
            onPutBack={(entryId, itemId) =>
              void actions.tick({ sectionId: menu.place.sectionId, templateId: null, entryId, itemId, inCv: true }, true)
            }
            onClose={close}
          />
        </ToolMenu>
      )}
      {menu?.kind === "section" && (
        <ToolMenu anchor={sectionAnchor} onClose={close}>
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
