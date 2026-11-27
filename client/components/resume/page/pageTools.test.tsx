import { TooltipProvider } from "@/components/ui/Tooltip";
import type { ChecklistSection } from "@/lib/resume/checklist";
import type { ChecklistActions } from "@/lib/resume/useCvChecklist";
import type { CurriculumSection } from "@/lib/types";
import { act, useRef } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CvEdits } from "../useCvEdits";
import type { Gap, PlacedBlock } from "./pagePlaces";
import PageTools from "./PageTools";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const places = vi.hoisted(() => ({ gapAt: vi.fn(), blockAt: vi.fn(), blockBeside: vi.fn() }));
vi.mock("./pagePlaces", async (actual) => ({ ...(await actual<typeof import("./pagePlaces")>()), ...places }));

/** An item at 120 to 140, a 16px line, in a column from 68 to 726, in sheet units. */
const itemBlock: PlacedBlock = { sectionId: 1, kind: "item", entryId: "e1", itemId: "i1", top: 120, bottom: 140, line: 16, aim: 140, left: 68, right: 726, side: "left" };
/** The next item, below it. */
const nextBlock: PlacedBlock = { ...itemBlock, itemId: "i2", top: 142, bottom: 160, aim: 160 };
const sectionGap: Gap = { afterSectionId: 1, top: 300, left: 68, right: 726, side: "left" };

const rows = [
  {
    key: "cv-1",
    name: "Experience",
    sectionId: 1,
    templateId: null,
    ticked: true,
    entries: [
      {
        id: "e1",
        inCv: true,
        title: "Northwind Pay",
        items: [
          { id: "i1", text: "Cut latency", inCv: true, off: false },
          { id: "i2", text: "Rebuilt the checkout", inCv: true, off: true },
          { id: "i3", text: "From the library", inCv: false, off: true },
        ],
      },
    ],
  },
] as unknown as ChecklistSection[];

// The drafts: what the put-back list reads. The library's items aren't in them.
const SECTIONS = [
  {
    id: 1,
    entries: [
      {
        id: "e1",
        content:
          '<ul><li data-cv-item="i1"><p>Cut latency</p></li><li data-cv-item="i2" data-cv-off="true"><p>Rebuilt the checkout</p></li></ul>',
      },
    ],
  },
] as unknown as CurriculumSection[];

let host: HTMLDivElement;
let root: Root;
let actions: { tick: ReturnType<typeof vi.fn>; orderSections: ReturnType<typeof vi.fn> };
let edits: { addAt: ReturnType<typeof vi.fn> };

let sections = SECTIONS;
let taken: { top: number; side: "left" | "right"; desk?: boolean }[] = [];
let scale = 1;
let deskRoom = 0;

const Sheet = () => {
  const rootRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  return (
    <TooltipProvider>
      <div id="area" ref={areaRef}>
        <div ref={rootRef} data-cv-page="p">
          <div className="resume-classic">
            <section data-section-id="1">
              <div data-entry-id="e1">
                <p id="item" data-cv-item="i1" tabIndex={-1}>
                  Cut latency
                </p>
                <p id="next" data-cv-item="i2">
                  Rebuilt the checkout
                </p>
              </div>
            </section>
          </div>
        </div>
        <div id="margin" />
        <PageTools
          rootRef={rootRef}
          areaRef={areaRef}
          scale={scale}
          sheetWidth={794}
          deskRoom={deskRoom}
          sections={sections}
          taken={taken}
          rows={rows}
          actions={actions as unknown as ChecklistActions}
          edits={edits as unknown as CvEdits}
          addSection={async () => {}}
        />
      </div>
    </TooltipProvider>
  );
};

const frame = () => new Promise((done) => requestAnimationFrame(() => done(null)));
/** At sheet units (x, y): the root is at the client's origin. */
const move = (target: Element, x = 100, y = 125) =>
  act(async () => {
    target.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: x * scale, clientY: y * scale }));
    await frame();
  });
const press = (element: Element | null) => act(async () => (element as HTMLElement).click());
const named = (label: string) => document.querySelector<HTMLElement>(`[aria-label="${label}"]`);
const item = (text: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((each) => each.textContent?.startsWith(text)) ?? null;
const render = () => act(async () => root.render(<Sheet />));

beforeEach(async () => {
  // jsdom has none.
  vi.stubGlobal("PointerEvent", class extends MouseEvent {});
  vi.stubGlobal("CSS", { escape: (text: string) => text });
  // For a tooltip.
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  places.gapAt.mockReturnValue(null);
  places.blockAt.mockImplementation((_root: unknown, _scale: unknown, target: Element) =>
    target.id === "item" ? itemBlock : target.id === "next" ? nextBlock : null
  );
  places.blockBeside.mockReturnValue(null);
  actions = { tick: vi.fn(), orderSections: vi.fn() };
  edits = { addAt: vi.fn() };
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await render();
});

// jsdom's own, which a test may stub.
const scrollIntoView = Element.prototype.scrollIntoView;

afterEach(async () => {
  Element.prototype.scrollIntoView = scrollIntoView;
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  taken = [];
  sections = SECTIONS;
  scale = 1;
  deskRoom = 0;
});

const gutterBox = () => {
  const gutter = document.querySelector<HTMLElement>("[data-page-gutter]")!;
  return { gutter, left: parseFloat(gutter.style.left), top: parseFloat(gutter.style.top), stacked: gutter.className.includes("flex-col") };
};

const margin = () => document.getElementById("margin")!;
const itemText = () => document.getElementById("item")!;

describe("PageTools", () => {
  it("shows nothing until the pointer moves, then a gutter of two by the block", async () => {
    expect(named("Add below")).toBeNull();
    await move(itemText());
    expect(named("Add below")).not.toBeNull();
    expect(named("Leave out Cut latency")).not.toBeNull();
    expect(document.querySelectorAll("[data-page-gutter] button")).toHaveLength(2);
  });

  it("has no gutter where there is no block, such as the header", async () => {
    await move(margin(), 30, 40);
    expect(named("Add below")).toBeNull();
  });

  it("shows it from the margin beside the block", async () => {
    places.blockBeside.mockReturnValue(itemBlock);
    await move(margin(), 30, 125);
    expect(named("Add below")).not.toBeNull();
  });

  it("keeps it as the pointer goes into the margin and onto its buttons, and from the block's later lines", async () => {
    await move(itemText());
    await move(margin(), 10, 138);
    await move(named("Add below")!, 40, 128);
    await move(named("Leave out Cut latency")!, 60, 128);
    await move(itemText(), 400, 139);
    expect(named("Add below")).not.toBeNull();
  });

  it("lingers 300ms after the pointer leaves, then goes", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"] });
    const step = (target: Element, x: number, y: number) =>
      act(async () => {
        target.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: x, clientY: y }));
        vi.advanceTimersByTime(16);
      });
    await step(itemText(), 100, 125);
    await step(margin(), 400, 400);
    await act(async () => vi.advanceTimersByTime(250));
    expect(named("Add below")).not.toBeNull();
    // Back in time: it stays.
    await step(itemText(), 100, 125);
    await act(async () => vi.advanceTimersByTime(400));
    expect(named("Add below")).not.toBeNull();
    await step(margin(), 400, 400);
    await act(async () => vi.advanceTimersByTime(300));
    expect(named("Add below")).toBeNull();
  });

  it("stays while its menu is open", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await move(itemText());
    await press(named("Add below"));
    await act(async () => {
      document.getElementById("area")!.dispatchEvent(new PointerEvent("pointerleave"));
      vi.advanceTimersByTime(1000);
    });
    expect(named("Add below")).not.toBeNull();
    expect(item("Bullet")).not.toBeNull();
  });

  it("puts nothing inside the page", async () => {
    const page = document.querySelector("[data-cv-page]")!;
    const before = page.innerHTML;
    await move(itemText());
    await press(named("Add below"));
    expect(page.innerHTML).toBe(before);
  });

  it("leaves the hovered block out", async () => {
    await move(itemText());
    await press(named("Leave out Cut latency"));
    expect(actions.tick).toHaveBeenCalledWith({ sectionId: 1, templateId: null, entryId: "e1", itemId: "i1", inCv: true }, false);
  });

  it("adds a bullet after the hovered item", async () => {
    await move(itemText());
    await press(named("Add below"));
    expect(item("Put back a left-out bullet")?.textContent).toContain("1");
    await press(item("Bullet"));
    expect(edits.addAt).toHaveBeenCalledWith({ sectionId: 1, entryId: "e1", after: "i1" }, "bullet");
  });

  it("adds at the top of a section by its heading", async () => {
    places.blockAt.mockReturnValue({ ...itemBlock, kind: "heading" });
    await move(itemText());
    await press(named("Add below"));
    await press(item("Entry"));
    expect(edits.addAt).toHaveBeenCalledWith({ sectionId: 1, entryId: null, after: null }, "entry");
  });

  it("puts back by a heading what its first entry that shows leaves out", async () => {
    const [first] = SECTIONS[0].entries;
    const out = '<ul><li data-cv-item="o1" data-cv-off="true"><p>Old one</p></li><li data-cv-item="o2" data-cv-off="true"><p>Old two</p></li></ul>';
    sections = [{ ...SECTIONS[0], entries: [{ ...first, id: "e0", hidden: true, content: out }, first] }] as unknown as CurriculumSection[];
    places.blockAt.mockReturnValue({ ...itemBlock, kind: "heading" });
    await render();
    await move(itemText());
    await press(named("Add below"));
    expect(item("Put back a left-out bullet")?.textContent).toContain("(1)");
    await press(item("Put back a left-out bullet"));
    await press(item("Rebuilt the checkout"));
    expect(actions.tick).toHaveBeenCalledWith({ sectionId: 1, templateId: null, entryId: "e1", itemId: "i2", inCv: true }, true);
  });

  it("shows where it adds, under the block, only once + is pointed at", async () => {
    await move(itemText());
    expect(document.querySelector("[data-add-line]")).toBeNull();
    await act(async () => named("Add below")!.dispatchEvent(new MouseEvent("pointerover", { bubbles: true })));
    const line = document.querySelector<HTMLElement>("[data-add-line]");
    expect(parseFloat(line!.style.top)).toBeCloseTo(140);
  });

  it("is drawn at screen size, placed from sheet units by the scale", async () => {
    scale = 0.75;
    places.blockAt.mockReturnValue({ ...itemBlock, left: 100 });
    await render();
    await move(itemText());
    const gutter = document.querySelector<HTMLElement>("[data-page-gutter]")!;
    gutter.querySelectorAll("button").forEach((button) => expect(button.className).toContain("size-[24px]"));
    // Its middle by the first line's; its right 4px before the text.
    expect(parseFloat(gutter.style.top)).toBeCloseTo((120 + 8) * 0.75 - 12);
    expect(parseFloat(gutter.style.left)).toBeCloseTo(100 * 0.75 - 4 - 50);
    for (let at: HTMLElement | null = gutter; at && at.id !== "area"; at = at.parentElement) expect(at.style.transform).toBe("");
  });

  it("is beside the sheet, level with the block, when there is room there", async () => {
    deskRoom = 100;
    await render();
    await move(itemText());
    const { left, top, stacked } = gutterBox();
    expect(left).toBe(-4 - 50);
    expect(top).toBeCloseTo(128 - 12);
    expect(stacked).toBe(false);
    places.blockAt.mockReturnValue({ ...itemBlock, top: 400, bottom: 420, side: "right", left: 300, right: 760 });
    await move(itemText(), 400, 410);
    expect(gutterBox().left).toBe(794 + 4);
  });

  it("stacks in a narrow margin, never over the text", async () => {
    scale = 0.924;
    places.blockAt.mockReturnValue({ ...itemBlock, left: 40 });
    await render();
    await move(itemText());
    const { gutter, left, stacked } = gutterBox();
    expect(stacked).toBe(true);
    gutter.querySelectorAll("button").forEach((button) => expect(button.className).toContain("size-[24px]"));
    expect(left + 24).toBeLessThanOrEqual(40 * 0.924 - 4);
    expect(left).toBeGreaterThanOrEqual(2);
  });

  it("is smaller in a margin too narrow even for that, 2px from the text and the sheet's edge", async () => {
    places.blockAt.mockReturnValue({ ...itemBlock, left: 26 });
    await move(itemText());
    const { gutter, left } = gutterBox();
    gutter.querySelectorAll("button").forEach((button) => expect(button.className).toContain("size-[20px]"));
    expect(left).toBe(4);
    expect(left + 20).toBeLessThanOrEqual(26 - 2);
    places.blockAt.mockReturnValue({ ...itemBlock, top: 400, bottom: 420, side: "right", left: 300, right: 770 });
    await move(itemText(), 400, 410);
    expect(gutterBox().left).toBe(772);
  });

  it("keeps its block as the pointer goes into the margin just below it, by the next block", async () => {
    places.blockBeside.mockReturnValue(nextBlock);
    await move(itemText());
    await move(margin(), 10, 144);
    expect(named("Leave out Cut latency")).not.toBeNull();
    // Well into the next one, it is that one's.
    await move(margin(), 10, 152);
    expect(named("Leave out Rebuilt the checkout")).not.toBeNull();
  });

  it("has tooltips that never take the pointer from the page", async () => {
    await move(itemText());
    await act(async () => named("Add below")!.focus());
    const tip = document.querySelector<HTMLElement>('[data-slot="tooltip-content"]');
    expect(tip?.textContent).toContain("Add below");
    expect(tip?.className).toContain("pointer-events-none");
    // Its positioning wrapper too, by page.css.
    expect(tip?.parentElement?.matches("[data-radix-popper-content-wrapper]:has(> [data-page-tip])")).toBe(true);
  });

  it("lets go of a block once the pointer is on the next one's text, though its stacked gutter reaches there", async () => {
    scale = 0.924;
    places.blockAt.mockImplementation((_root: unknown, _scale: unknown, target: Element) =>
      target.id === "item" ? { ...itemBlock, left: 40 } : target.id === "next" ? { ...nextBlock, left: 40 } : null
    );
    await render();
    await move(itemText());
    expect(gutterBox().stacked).toBe(true);
    await move(document.getElementById("next")!, 400, 150);
    expect(named("Leave out Rebuilt the checkout")).not.toBeNull();
  });

  it("keeps a block as the pointer goes straight down its stacked gutter to the tick", async () => {
    scale = 0.924;
    places.blockAt.mockImplementation((_root: unknown, _scale: unknown, target: Element) =>
      target.id === "item" ? { ...itemBlock, left: 40 } : null
    );
    places.blockBeside.mockReturnValue({ ...nextBlock, left: 40 });
    await render();
    await move(itemText());
    const { left, top } = gutterBox();
    // From the plus's middle down to the tick's, in the margin, in sheet units.
    for (let y = top + 12; y <= top + 24 + 2 + 12; y += 4) await move(margin(), (left + 12) / scale, y / scale);
    expect(named("Leave out Cut latency")).not.toBeNull();
  });

  it("moves off only the marks where it is: in the margin, or beside the sheet", async () => {
    deskRoom = 100;
    taken = [{ top: 130, side: "left", desk: false }];
    await render();
    await move(itemText());
    expect(gutterBox().top).toBeCloseTo(116);
    taken = [{ top: 130, side: "left", desk: true }];
    await render();
    await move(margin(), 30, 400);
    await act(async () => new Promise((done) => setTimeout(done, 350)));
    await move(itemText());
    expect(gutterBox().top).toBeGreaterThan(116 + 12);
  });

  it("aims where an entry's addition goes: under its summary", async () => {
    places.blockAt.mockReturnValue({ ...itemBlock, kind: "entry", bottom: 132, aim: 150 });
    await move(itemText());
    await act(async () => named("Add below")!.dispatchEvent(new MouseEvent("pointerover", { bubbles: true })));
    expect(parseFloat(document.querySelector<HTMLElement>("[data-add-line]")!.style.top)).toBeCloseTo(150);
  });

  it("moves off a mark in its margin, so both can be pressed", async () => {
    taken = [{ top: 130, side: "left" }];
    await render();
    await move(itemText());
    const gutter = document.querySelector<HTMLElement>("[data-page-gutter]")!;
    const middle = parseFloat(gutter.style.top) + 12;
    expect(Math.abs(middle - 130)).toBeGreaterThanOrEqual(24);
  });

  it("moves up off a mark within its block's rows, rather than down past them", async () => {
    scale = 0.924;
    taken = [{ top: 165, side: "left" }];
    places.blockAt.mockReturnValue({ ...itemBlock, left: 40, bottom: 220 });
    await render();
    await move(itemText());
    const { top, stacked } = gutterBox();
    expect(stacked).toBe(true);
    // Its middle a mark's apart above the mark: (25 + 12 + 1) screen px.
    expect(top).toBeCloseTo(165 * 0.924 - 38 - 25);
  });

  it("keeps its block across the margin down to a gutter pushed off it, but not across the text", async () => {
    // A heading level with a fold, and the next entry's title level with the one below it.
    taken = [
      { top: 128, side: "left" },
      { top: 153, side: "left" },
    ];
    places.blockBeside.mockReturnValue(nextBlock);
    await render();
    await move(itemText());
    // Below both marks.
    expect(gutterBox().top).toBeCloseTo(178 - 12);
    for (const y of [130, 150, 158, 170, 178]) {
      await move(margin(), 10, y);
      expect(named("Leave out Cut latency")).not.toBeNull();
    }
    await move(document.getElementById("next")!, 400, 150);
    expect(named("Leave out Rebuilt the checkout")).not.toBeNull();
  });

  it("moves off a mark at a fraction of a px at a fractional scale, and ends", async () => {
    scale = 0.924;
    taken = [{ top: 113.37, side: "left" }];
    places.blockAt.mockReturnValue({ ...itemBlock, top: 105.37, line: 16 });
    await render();
    await move(itemText(), 100, 110);
    expect(document.querySelector("[data-page-gutter]")).not.toBeNull();
  });

  it("puts a left-out item back from its list", async () => {
    await move(itemText());
    await press(named("Add below"));
    await press(item("Put back a left-out bullet"));
    expect(item("From the library")).toBeNull();
    await press(item("Rebuilt the checkout"));
    expect(actions.tick).toHaveBeenCalledWith({ sectionId: 1, templateId: null, entryId: "e1", itemId: "i2", inCv: true }, true);
  });

  it("closes a menu from its button", async () => {
    await move(itemText());
    await press(named("Add below"));
    expect(item("Bullet")).not.toBeNull();
    await press(named("Add below"));
    expect(item("Bullet")).toBeNull();
  });

  it("closes once the focus goes out of it and its button, not into it", async () => {
    await move(itemText());
    await press(named("Add below"));
    await act(async () => item("Paragraph")!.focus());
    await act(async () => named("Add below")!.focus());
    expect(item("Bullet")).not.toBeNull();
    await act(async () => itemText().focus());
    expect(item("Bullet")).toBeNull();
  });

  it("bounds a long put-back list to the room there is, and scrolls to the row the keys go to", async () => {
    const many = Array.from({ length: 40 }, (_, index) => `<li data-cv-item="m${index}" data-cv-off="true"><p>Old ${index}</p></li>`).join("");
    sections = [{ ...SECTIONS[0], entries: [{ ...SECTIONS[0].entries[0], content: `<ul>${many}</ul>` }] }] as unknown as CurriculumSection[];
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    await render();
    await move(itemText());
    await press(named("Add below"));
    await press(item("Put back a left-out bullet"));
    await act(async () => frame());
    const menu = document.querySelector<HTMLElement>('[role="menu"]')!;
    const box = menu.parentElement!;
    expect(box.className).toContain("overflow-y-auto");
    expect(box.style.maxHeight).toMatch(/px$/);
    await act(async () => {
      menu.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowUp" }));
    });
    expect(document.activeElement?.textContent).toBe("Old 39");
    expect(scrolled.mock.contexts.at(-1)).toBe(document.activeElement);
  });

  it.each([
    ["MacIntel", "Add below (⌥↵)"],
    ["Win32", "Add below (Alt+Enter)"],
  ])("says its shortcut in its tooltip, on %s", async (platform, tip) => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
    await render();
    await move(itemText());
    expect(named("Add below")?.getAttribute("aria-keyshortcuts")).toBe("Alt+Enter");
    await act(async () => named("Add below")!.focus());
    expect(document.querySelector('[data-slot="tooltip-content"]')?.textContent).toContain(tip);
  });

  it("looks for a section gap only off the blocks", async () => {
    places.gapAt.mockClear();
    await move(itemText());
    expect(places.gapAt).not.toHaveBeenCalled();
    await move(margin(), 400, 300);
    expect(places.gapAt).toHaveBeenCalled();
  });

  it("shows a light + Section across its gap, and opens the section menu", async () => {
    places.gapAt.mockReturnValue(sectionGap);
    await move(margin(), 400, 300);
    const pill = named("Add a section")!;
    expect(pill.textContent).toBe("Section");
    expect(pill.querySelector("svg")).not.toBeNull();
    // Fits the space between a section's last line and the next heading.
    expect(pill.className).toContain("h-[16px]");
    expect(pill.className).toContain("cursor-pointer");
    expect(named("Add below")).toBeNull();
    await press(pill);
    expect(document.activeElement?.getAttribute("placeholder")).toBe("Search your sections…");
  });

  it("lights its line on hover, and opens the menu from the line too", async () => {
    places.gapAt.mockReturnValue(sectionGap);
    await move(margin(), 400, 300);
    const line = document.querySelector<HTMLElement>('[data-page-section-line]')!;
    const mark = () => line.querySelector("span")!.className;
    expect(mark()).toContain("border-dashed");
    await act(async () => {
      line.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
      line.dispatchEvent(new PointerEvent("pointerenter"));
    });
    expect(mark()).toContain("bg-[#f5a524]");
    expect(named("Add a section")!.className).toContain("bg-[#fff4dc]");
    await press(line);
    expect(document.activeElement?.getAttribute("placeholder")).toBe("Search your sections…");
  });

  describe("from the keyboard", () => {
    /** The caret in the item's text, as the editor would have it. */
    const caretIn = (element: HTMLElement) => {
      element.focus();
      document.getSelection()?.collapse(element.firstChild, 3);
    };
    const keys = (init: KeyboardEventInit) =>
      act(async () => {
        itemText().dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter", ...init }));
      });

    it("opens the add menu by the caret's block on Alt+Enter, with nothing hovered", async () => {
      caretIn(itemText());
      await keys({ altKey: true });
      expect(named("Add below")?.getAttribute("aria-expanded")).toBe("true");
      await press(item("Paragraph"));
      expect(edits.addAt).toHaveBeenCalledWith({ sectionId: 1, entryId: "e1", after: "i1" }, "paragraph");
    });

    it("opens the section menu after the caret's section on Alt+Shift+Enter", async () => {
      caretIn(itemText());
      await keys({ altKey: true, shiftKey: true });
      expect(document.activeElement?.getAttribute("placeholder")).toBe("Search your sections…");
    });

    it("does nothing for a plain Enter", async () => {
      caretIn(itemText());
      await keys({});
      expect(named("Add below")).toBeNull();
      expect(item("Bullet")).toBeNull();
    });

    it("puts the caret back where it was on Escape", async () => {
      caretIn(itemText());
      await keys({ altKey: true });
      expect(document.activeElement).not.toBe(itemText());
      await act(async () => {
        document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }));
      });
      expect(item("Bullet")).toBeNull();
      expect(document.activeElement).toBe(itemText());
    });
  });
});
