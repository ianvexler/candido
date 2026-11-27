import { describe, expect, it, vi } from "vitest";
import { SectionEntry } from "@/lib/types";
import { dimmingRule, labelChips } from "./LabelArea";
import { pickerLabels } from "./LabelPicker";
import { labelSelection, selectionTargets } from "./SelectionBar";

const labels = [
  { id: 1, name: "Data" },
  { id: 2, name: "Teaching" },
  { id: 3, name: "Research" },
];

describe("labelChips", () => {
  it("names the item's own labels", () => {
    expect(labelChips(labels, { own: [2, 1], inherited: [] })).toEqual([
      { name: "Teaching", fromEntry: false },
      { name: "Data", fromEntry: false },
    ]);
  });

  it("marks the entry's labels as from the entry, once", () => {
    expect(labelChips(labels, { own: [1], inherited: [1, 3] })).toEqual([
      { name: "Data", fromEntry: false },
      { name: "Research", fromEntry: true },
    ]);
  });

  it("is every purpose with none", () => {
    expect(labelChips(labels, { own: [], inherited: [] })).toEqual([{ name: "Every collection", fromEntry: false }]);
    // A label that is gone counts as none.
    expect(labelChips(labels, { own: [9], inherited: [] })).toEqual([{ name: "Every collection", fromEntry: false }]);
  });
});

describe("dimmingRule", () => {
  const template = {
    entries: [
      { id: "e1", content: '<p data-cv-item="i1">A</p><ul><li data-cv-item="i2"><p>B</p></li></ul><p>New</p>' },
      { id: "e2", content: '<p data-cv-item="i3">C</p><p data-cv-item="i4">D</p>' },
    ] as SectionEntry[],
    item_labels: { i1: [1], i2: [2], e2: [2], i4: [1] },
  };
  const dimmed = (rule: string) => [...rule.matchAll(/data-cv-item="([^"]+)"/g)].map((match) => match[1]).sort();

  it("dims exactly the items not in the filter, within the section", () => {
    const rule = dimmingRule(7, template, { kind: "label", id: 1 });
    expect(dimmed(rule)).toEqual(["i2", "i3"]);
    expect(rule).toContain('[data-section-id="7"]');
  });

  it("dims what has labels when not labelled is chosen", () => {
    expect(dimmed(dimmingRule(7, template, { kind: "none" }))).toEqual(["i1", "i2", "i3", "i4"]);
  });

  it("dims nothing for all content, or when everything fits", () => {
    expect(dimmingRule(7, template, { kind: "all" })).toBe("");
    expect(dimmingRule(7, { ...template, item_labels: {} }, { kind: "label", id: 1 })).toBe("");
  });
});

describe("pickerLabels", () => {
  it("puts the chosen purpose first", () => {
    expect(pickerLabels(labels, { kind: "label", id: 3 }).map(({ id }) => id)).toEqual([3, 1, 2]);
    expect(pickerLabels(labels, { kind: "all" }).map(({ id }) => id)).toEqual([1, 2, 3]);
  });
});

describe("labelling a selection", () => {
  it("calls onLabel with every selected item", async () => {
    const onLabel = vi.fn(async () => {});
    await labelSelection(4, new Set(["i1", "i3", "i9"]), onLabel, 2, true);
    expect(onLabel).toHaveBeenCalledWith(2, true, [
      { section_template_id: 4, id: "i1" },
      { section_template_id: 4, id: "i3" },
      { section_template_id: 4, id: "i9" },
    ]);
  });

  it("keeps only items still in the section", () => {
    expect(selectionTargets(4, new Set(["i1", "gone"]), new Set(["i1", "i2"]))).toEqual([
      { section_template_id: 4, id: "i1" },
    ]);
  });
});
