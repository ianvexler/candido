import { describe, expect, it } from "vitest";
import { SectionEntry, SectionTemplate } from "@/lib/types";
import cases from "./purposeFitCases.json";
import { carryingCount, entryFits, inFilter, itemFits, labelsOf, outline, purposeCounts, sectionFits } from "./purposes";

type Case = (typeof cases)[number];

const template = (
  entries: { id: string; description?: string | null; content: string; title?: string; role?: string }[],
  item_labels: Record<string, number[]> = {},
  extra: Partial<SectionTemplate> = {}
): SectionTemplate =>
  ({
    id: 1,
    section_type: "Experience",
    position: 0,
    item_labels,
    entries: entries.map((entry) => ({ title: "", description: null, ...entry })) as SectionEntry[],
    ...extra,
  }) as SectionTemplate;

describe("the shared fit cases", () => {
  cases.forEach((c: Case) => {
    it(c.name, () => {
      const t = template(c.template.entries, c.template.item_labels as Record<string, number[]>);
      Object.entries(c.items).forEach(([key, expected]) => {
        const [entryId, itemId] = key.split("/");
        expect(itemFits(t, entryId, itemId, c.label_id), key).toBe(expected);
      });
      Object.entries(c.entries).forEach(([id, expected]) => expect(entryFits(t, id, c.label_id), id).toBe(expected));
      expect(sectionFits(t, c.label_id)).toBe(c.section);
    });
  });
});

describe("labelsOf", () => {
  const t = template([{ id: "e1", description: "S", content: '<p data-cv-item="i1">A</p>' }], { e1: [1], i1: [2] });

  it("tells own labels from the entry's", () => {
    expect(labelsOf(t, "e1", "i1")).toEqual({ own: [2], inherited: [1] });
    expect(labelsOf(t, "e1")).toEqual({ own: [1], inherited: [] });
  });

  it("gives a summary no labels of its own", () => {
    expect(labelsOf(t, "e1", "$summary")).toEqual({ own: [], inherited: [1] });
  });
});

describe("inFilter", () => {
  const t = template(
    [{ id: "e1", content: '<p data-cv-item="i1">A</p><p data-cv-item="i2">B</p>' }, { id: "e2", content: '<p data-cv-item="i3">C</p>' }],
    { i1: [1], e2: [2] }
  );

  it("keeps everything for all", () => {
    expect(inFilter(t, "e1", "i2", { kind: "all" })).toBe(true);
  });

  it("takes a label as what fits it", () => {
    expect(inFilter(t, "e1", "i1", { kind: "label", id: 1 })).toBe(true);
    expect(inFilter(t, "e2", "i3", { kind: "label", id: 1 })).toBe(false);
  });

  it("takes none as no own or inherited labels", () => {
    expect(inFilter(t, "e1", "i1", { kind: "none" })).toBe(false);
    expect(inFilter(t, "e1", "i2", { kind: "none" })).toBe(true);
    expect(inFilter(t, "e2", "i3", { kind: "none" })).toBe(false);
    expect(inFilter(t, "e1", "$summary", { kind: "none" })).toBe(true);
    expect(inFilter(t, "e2", "$summary", { kind: "none" })).toBe(false);
  });
});

describe("purposeCounts and outline", () => {
  const templates = [
    template(
      [
        { id: "e1", title: "Acme", content: '<ul><li data-cv-item="i1">Rails</li><li data-cv-item="i2">Design</li></ul>' },
        { id: "e2", content: "" },
      ],
      { i1: [1], i2: [2] },
      { id: 1, section_type: "Experience", position: 1 }
    ),
    template(
      [{ id: "e3", title: "", role: "Engineer", content: '<p data-cv-item="i3">Plain</p>' }],
      { e3: [2] },
      { id: 2, section_type: "Skills", position: 0 }
    ),
  ];
  const labels = [
    { id: 1, name: "Backend" },
    { id: 2, name: "Design" },
  ];

  it("counts items, and an entry with none as one", () => {
    const counts = purposeCounts(templates, labels);
    expect(counts.get("all")).toBe(4);
    expect(counts.get("none")).toBe(1);
    expect(counts.get(1)).toBe(2);
    expect(counts.get(2)).toBe(3);
  });

  it("hides what doesn't fit and orders sections by position", () => {
    const all = outline(templates, { kind: "all" }, "");
    expect(all.map((s) => s.name)).toEqual(["Skills", "Experience"]);

    const backend = outline(templates, { kind: "label", id: 1 }, "");
    expect(backend.map((s) => s.name)).toEqual(["Experience"]);
    expect(backend[0].entries.map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(backend[0].count).toBe(2);
  });

  it("hides an entry that doesn't fit", () => {
    const design = outline(templates, { kind: "label", id: 2 }, "");
    expect(design.map((s) => s.name)).toEqual(["Skills", "Experience"]);
    expect(design[1].entries.map((e) => e.id)).toEqual(["e1", "e2"]);
    const onlyNone = outline(templates, { kind: "none" }, "");
    expect(onlyNone.map((section) => [section.name, section.count, section.entries.map((e) => e.id)])).toEqual([["Experience", 1, ["e2"]]]);
  });

  it("matches the query in item text and keeps its entry", () => {
    const found = outline(templates, { kind: "all" }, "rails");
    expect(found.map((s) => s.name)).toEqual(["Experience"]);
    expect(found[0].entries.map((e) => e.id)).toEqual(["e1"]);
  });

  it("matches a section name or an entry title", () => {
    expect(outline(templates, { kind: "all" }, "skills").map((s) => s.name)).toEqual(["Skills"]);
    expect(outline(templates, { kind: "all" }, "acme")[0].entries.map((e) => e.id)).toEqual(["e1"]);
  });

  it("titles an entry as the checklist does", () => {
    const found = outline(templates, { kind: "all" }, "");
    expect(found[0].entries[0].title).toBe("Engineer");
    expect(found[1].entries[0].title).toBe("Acme");
    expect(found[1].entries[1].title).toBe("Untitled");
  });
});

describe("carryingCount", () => {
  it("counts items with the label, their own or their entry's, and an entry with no items as one", () => {
    const templates = [
      template(
        [
          { id: "e1", content: '<ul><li data-cv-item="i1">Rails</li><li data-cv-item="i2">Design</li></ul>' },
          { id: "e2", content: '<p data-cv-item="i3">Go</p>' },
          { id: "e4", content: "" },
        ],
        // e1 passes the label to both its items; "gone" was deleted and stays behind.
        { e1: [1], i1: [1], i3: [1, 2], e4: [1], gone: [1] }
      ),
      template([{ id: "e5", content: '<p data-cv-item="i5">Plain</p>' }], {}, { id: 2 }),
    ];
    expect(carryingCount(templates, 1)).toBe(4);
    expect(carryingCount(templates, 2)).toBe(1);
    expect(carryingCount(templates, 3)).toBe(0);
  });
});
