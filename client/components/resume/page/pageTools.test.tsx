import { TooltipProvider } from "@/components/ui/Tooltip";
import type { ChecklistSection } from "@/lib/resume/checklist";
import type { ChecklistActions } from "@/lib/resume/useCvChecklist";
import type { CurriculumSection } from "@/lib/types";
import { act, createRef, useRef } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CvEdits } from "../useCvEdits";
import type { Gap } from "./pagePlaces";
import PageTools, { PageToolsHandle } from "./PageTools";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const places = vi.hoisted(() => ({ gapAt: vi.fn(), blockAt: vi.fn() }));
vi.mock("./pagePlaces", async (actual) => ({ ...(await actual<typeof import("./pagePlaces")>()), ...places }));

const addGap: Gap = { kind: "add", place: { sectionId: 1, entryId: "e1", after: "i1" }, top: 200, left: 68, right: 726, side: "left" };

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

let host: HTMLDivElement;
let root: Root;
let actions: { tick: ReturnType<typeof vi.fn>; orderSections: ReturnType<typeof vi.fn> };
let edits: { addAt: ReturnType<typeof vi.fn> };
const handle = createRef<PageToolsHandle>();

const Sheet = () => {
  const rootRef = useRef<HTMLDivElement>(null);
  return (
    <TooltipProvider>
      <div id="area">
        <div ref={rootRef} data-cv-page="p">
          <div className="resume-classic">
            <section data-section-id="1">
              <p id="item">Cut latency</p>
            </section>
          </div>
        </div>
        <PageTools
          ref={handle}
          rootRef={rootRef}
          scale={1}
          sections={[{ id: 1 } as CurriculumSection]}
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
const move = (target: Element) =>
  act(async () => {
    target.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 100, clientY: 205 }));
    await frame();
  });
const press = (element: Element | null) => act(async () => (element as HTMLElement).click());
const named = (label: string) => document.querySelector(`[aria-label="${label}"]`);
const item = (text: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((each) => each.textContent?.startsWith(text)) ?? null;

beforeEach(async () => {
  // jsdom has none.
  vi.stubGlobal("PointerEvent", class extends MouseEvent {});
  places.gapAt.mockReturnValue(addGap);
  places.blockAt.mockReturnValue({ sectionId: 1, kind: "item", entryId: "e1", itemId: "i1", top: 120, side: "left" });
  actions = { tick: vi.fn(), orderSections: vi.fn() };
  edits = { addAt: vi.fn() };
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Sheet />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("PageTools", () => {
  it("shows nothing until the pointer moves, then one tick and one pill", async () => {
    expect(named("Leave out Cut latency")).toBeNull();
    expect(named("Add here")).toBeNull();
    await move(document.getElementById("item")!);
    expect(document.querySelectorAll('[aria-label^="Leave out"]')).toHaveLength(1);
    expect(document.querySelectorAll('[aria-label="Add here"], [aria-label="Add a section"]')).toHaveLength(1);
    expect(named("Add here")?.textContent).toBe("+ Add");
  });

  it("puts nothing inside the page", async () => {
    const page = document.querySelector("[data-cv-page]")!;
    const before = page.innerHTML;
    await move(document.getElementById("item")!);
    await press(named("Add here"));
    expect(page.innerHTML).toBe(before);
  });

  it("leaves the hovered block out", async () => {
    await move(document.getElementById("item")!);
    await press(named("Leave out Cut latency"));
    expect(actions.tick).toHaveBeenCalledWith({ sectionId: 1, templateId: null, entryId: "e1", itemId: "i1", inCv: true }, false);
  });

  it("adds a bullet at the gap", async () => {
    await move(document.getElementById("item")!);
    await press(named("Add here"));
    expect(item("Put back a left-out bullet")?.textContent).toContain("1");
    await press(item("Bullet"));
    expect(edits.addAt).toHaveBeenCalledWith(addGap.place, "bullet");
  });

  it("puts a left-out item back from its list", async () => {
    await act(async () => handle.current!.openAdd(addGap));
    await press(item("Put back a left-out bullet"));
    expect(item("From the library")).toBeNull();
    await press(item("Rebuilt the checkout"));
    expect(actions.tick).toHaveBeenCalledWith({ sectionId: 1, templateId: null, entryId: "e1", itemId: "i2", inCv: true }, true);
  });

  it("opens the section menu", async () => {
    places.gapAt.mockReturnValue({ ...addGap, kind: "section", afterSectionId: 1 });
    await move(document.getElementById("item")!);
    await press(named("Add a section"));
    expect(document.activeElement?.getAttribute("placeholder")).toBe("Search your sections…");
  });
});
