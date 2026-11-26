import { TooltipProvider } from "@/components/ui/Tooltip";
import type { ChecklistActions } from "@/lib/resume/useCvChecklist";
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FoldMarks from "./FoldMarks";
import type { FoldAt } from "./folds";
import { HiddenMarkAt, MARK_SIZE, mergeMarks } from "./HiddenTextMarks";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fold: FoldAt = {
  top: 200,
  side: "left",
  line: { top: 200, left: 68, right: 726 },
  items: [
    { sectionId: 1, entryId: "a", itemId: "b2", label: "Rebuilt the checkout" },
    { sectionId: 1, entryId: "a", itemId: "b3", label: "Cut latency".padEnd(100, "!") },
  ],
};

let host: HTMLDivElement;
let root: Root;
let tick: ReturnType<typeof vi.fn>;

const render = (folds: FoldAt[]) =>
  act(async () =>
    root.render(
      <TooltipProvider>
        <FoldMarks folds={folds} inside={false} actions={{ tick } as unknown as ChecklistActions} />
      </TooltipProvider>
    )
  );
const press = (element: Element | null | undefined) => act(async () => (element as HTMLElement).click());
const mark = () => [...document.querySelectorAll("button")].find((button) => button.textContent === "2 left out");
const rows = () => [...document.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]')];

beforeEach(async () => {
  tick = vi.fn(async () => 1);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await render([fold]);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("FoldMarks", () => {
  it("says how many are left out", () => {
    expect(mark()).toBeDefined();
  });

  it("lists each of them, cut to 80 characters", async () => {
    await press(mark());
    expect(rows().map((row) => row.textContent)).toEqual(["Rebuilt the checkout", `${"Cut latency".padEnd(80, "!")}…`]);
  });

  it("puts one back with its tick, and stays open", async () => {
    await press(mark());
    await press(rows()[0]);
    expect(tick).toHaveBeenCalledWith({ sectionId: 1, templateId: null, entryId: "a", itemId: "b2", inCv: true }, true);
    // Back on the page: the fold no longer has it.
    await render([{ ...fold, items: fold.items.slice(1) }]);
    expect(rows()).toHaveLength(2);
    expect(rows()[0].getAttribute("aria-checked")).toBe("true");
    expect(rows()[1].getAttribute("aria-checked")).toBe("false");
  });
});

describe("mergeMarks", () => {
  it("keeps a fold and a hidden-text mark apart", () => {
    const hidden: HiddenMarkAt = { top: 200, side: "left", places: [{ sectionId: 1, entryId: "a", itemIds: ["b1"] }] };
    const [first, second] = mergeMarks<HiddenMarkAt | FoldAt>([hidden, fold]);
    expect(second.top - first.top).toBe(MARK_SIZE);
  });

  const eye = (top: number, itemId: string): HiddenMarkAt => ({ top, side: "left", places: [{ sectionId: 1, entryId: "a", itemIds: [itemId] }] });

  it("merges hidden-text marks a fold is between", () => {
    const merged = mergeMarks<HiddenMarkAt | FoldAt>([eye(200, "b1"), { ...fold, top: 205 }, eye(210, "b3")]);
    expect(merged.map(({ top }) => top)).toEqual([200, 200 + MARK_SIZE]);
    expect((merged[0] as HiddenMarkAt).places).toHaveLength(2);
  });

  it("moves folds, never a hidden-text mark from its text", () => {
    const merged = mergeMarks<HiddenMarkAt | FoldAt>([{ ...fold, top: 195 }, eye(200, "b1"), eye(230, "b2")]);
    const eyes = merged.filter((mark) => "places" in mark).map(({ top }) => top);
    expect(eyes).toEqual([200, 230]);
    const [folded] = merged.filter((mark) => "items" in mark);
    expect(merged.every((mark) => mark === folded || Math.abs(mark.top - folded.top) >= MARK_SIZE)).toBe(true);
  });

  it("still merges hidden-text marks that would overlap", () => {
    const at = (top: number, itemId: string): HiddenMarkAt => ({ top, side: "left", places: [{ sectionId: 1, entryId: "a", itemIds: [itemId] }] });
    expect(mergeMarks([at(200, "b1"), at(210, "b2")])).toHaveLength(1);
  });
});
