import type { ChecklistSection } from "@/lib/resume/checklist";
import type { ChecklistActions } from "@/lib/resume/useCvChecklist";
import type { CurriculumSection } from "@/lib/types";
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SectionMenu from "./SectionMenu";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const row = (name: string, sectionId: number | null, templateId: number | null, ticked: boolean, entries = 1, libraryOnly = 0) =>
  ({
    key: name,
    name,
    sectionId,
    templateId,
    ticked,
    hidden: !ticked,
    entries: Array.from({ length: entries + libraryOnly }, (_, index) => ({ inCv: sectionId !== null && index < entries })),
  }) as ChecklistSection;

const rows = [
  row("Experience", 1, null, true),
  // Its library section has another entry, which isn't in this CV.
  row("Volunteering", 2, 20, false, 3, 1),
  row("Talks", null, 30, false),
  row("Awards", null, 40, false, 2),
];

const section = (id: number, templateId: number | null = null) => ({ id, section_template_id: templateId }) as CurriculumSection;

let host: HTMLDivElement;
let root: Root;
let actions: { tick: ReturnType<typeof vi.fn>; placeSection: ReturnType<typeof vi.fn> };
let addSection: ReturnType<typeof vi.fn>;
let onClose: ReturnType<typeof vi.fn>;

const Harness = ({ sections }: { sections: CurriculumSection[] }) => (
  <SectionMenu
    rows={rows}
    order={sections.map(({ id }) => id)}
    afterSectionId={1}
    actions={actions as unknown as ChecklistActions}
    addSection={addSection}
    onClose={onClose}
  />
);

const render = (sections = [section(1), section(2)]) => act(async () => root.render(<Harness sections={sections} />));
const input = () => host.querySelector<HTMLInputElement>("input")!;
const options = () => [...host.querySelectorAll('[role="option"]')].map((option) => option.textContent);
const type = (value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input(), value);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
const key = (name: string) =>
  act(async () => void input().dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true })));

beforeEach(() => {
  actions = { tick: vi.fn(async () => null), placeSection: vi.fn() };
  addSection = vi.fn(async () => {});
  onClose = vi.fn();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("SectionMenu", () => {
  it("lists the CV's left-out sections before the library's, with their entry counts", async () => {
    await render();
    expect(input().placeholder).toBe("Search your sections…");
    expect(document.activeElement).toBe(input());
    expect(options()).toEqual(["Volunteering3 entries", "Talks1 entry", "Awards2 entries", "Blank section"]);
  });

  it("filters by what is typed", async () => {
    await render();
    await type("aw");
    expect(options()).toEqual(["Awards2 entries", "Blank section"]);
  });

  it("offers a new section with that name when nothing matches, and Blank section last", async () => {
    await render();
    await type("Talkz");
    expect(options()).toEqual(["New section “Talkz”", "Blank section"]);
    await key("Enter");
    expect(addSection).toHaveBeenCalledWith("Talkz", 1);
    expect(onClose).toHaveBeenCalledWith(false);
  });

  it("adds a blank section", async () => {
    await render();
    await key("ArrowUp");
    await key("Enter");
    expect(addSection).toHaveBeenCalledWith("Section", 1);
  });

  it("puts a left-out section back after the given section", async () => {
    await render([section(2), section(1)]);
    await key("Enter");
    expect(actions.tick).toHaveBeenCalledWith({ sectionId: 2, templateId: 20, inCv: true }, true);
    expect(actions.placeSection).toHaveBeenCalledWith(2, 1);
  });

  const chooseLibrary = async (included: number | null) => {
    actions.tick.mockResolvedValue(included);
    await render([section(1), section(2)]);
    await key("ArrowDown");
    await key("Enter");
    expect(actions.tick).toHaveBeenCalledWith({ sectionId: null, templateId: 30, inCv: false }, true);
  };

  it("ticks a library section in, then places its copy after the given section", async () => {
    await chooseLibrary(9);
    expect(actions.placeSection).toHaveBeenCalledWith(9, 1);
  });

  it("places nothing when the include fails, or was already under way", async () => {
    await chooseLibrary(null);
    expect(actions.placeSection).not.toHaveBeenCalled();
  });

  it("leaves a copy the CV already had where it is", async () => {
    await chooseLibrary(2);
    expect(actions.placeSection).not.toHaveBeenCalled();
  });

  it("closes on Escape, giving the focus back", async () => {
    await render();
    await key("Escape");
    expect(onClose).toHaveBeenCalledWith(true);
  });
});
