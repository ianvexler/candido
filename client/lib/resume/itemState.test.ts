import { EntryFields } from "@/lib/types";
import { describe, expect, it } from "vitest";
import { actionLabel, actionsFor, differingFields, fieldsState, itemState } from "./itemState";

const html = (text: string) => `<p data-cv-item="a">${text}</p>`;

const fields = (title: string, changes: Partial<EntryFields> = {}): EntryFields => ({
  title,
  role: null,
  organization: null,
  location: null,
  start_date: null,
  end_date: null,
  current: false,
  description: null,
  ...changes,
});

const cases = [
  ["A", "A", null, "same"],
  ["A", "A", "B", "same"],
  ["A2", "A", "A", "cv_changed"],
  ["A", "A2", "A", "library_changed"],
  ["A2", "A3", "A", "both_changed"],
  ["A", "B", null, "differs"],
  ["A", null, "A", "cv_only"],
  [null, "A", "A", "library_only"],
] as const;

describe("itemState", () => {
  it.each(cases)("%s against %s from %s is %s", (cv, library, base, state) =>
    expect(itemState(cv && html(cv), library && html(library), base && html(base))).toBe(state));

  it("takes a missing base as none", () => {
    const bases: Record<string, string> = {};
    expect(itemState(html("A"), html("B"), bases.a)).toBe("differs");
  });

  it("ignores formatting whitespace, ids and ticks when comparing", () =>
    expect(itemState('<li data-cv-item="a" data-cv-off="true"><p>A  b</p></li>', '<li data-cv-item="a"><p>A b</p></li>', null)).toBe("same"));

  it.each([
    ["<li>\n  <p> A b </p>\n</li>", "<li><p>A b</p></li>"],
    ["<p>A <strong> b</strong></p>", "<p>A <strong>b</strong></p>"],
    ["<p>A <br> b</p>", "<p>A<br>b</p>"],
    ['<p>A <span data-cv-hidden="true">b <em>c</em></span> d</p>', "<p>A b <em>c</em> d</p>"],
    ['<p><a rel="x" href="y">A</a></p>', '<p><a href="y" rel="x">A</a></p>'],
    ['<p><a target="_blank" rel="noopener" href="y">A</a></p>', '<p><a href="y">A</a></p>'],
    ['<p><span style="color: rgb(1, 2, 3)">A</span></p>', '<p><span style="color:rgb(1, 2, 3);">A</span></p>'],
    ["<li>A</li>", "<li><p>A</p></li>"],
    ["<li>\n A <em>b</em><br>c\n <ul> <li>D</li> </ul></li>", "<li><p>A <em>b</em><br>c</p><ul><li><p>D</p></li></ul></li>"],
    ["<blockquote><ol><li>A</li></ol></blockquote>", "<blockquote><ol><li><p>A</p></li></ol></blockquote>"],
  ])("takes %j as the same as %j", (a, b) => expect(itemState(a, b, null)).toBe("same"));

  it.each([
    ["<p>A b</p>", "<p>Ab</p>"],
    ["<p>A <strong>b</strong></p>", "<p>A<strong>b</strong></p>"],
    ["<p>A</p>", "<p><em>A</em></p>"],
    ["<p>A</p>", "<h2>A</h2>"],
    ["<p>A&nbsp;b</p>", "<p>A b</p>"],
    ['<p><a rel="x" href="y">A</a></p>', '<p><a rel="x" href="z">A</a></p>'],
    ["<li>AB</li>", "<li><p>A</p><p>B</p></li>"],
    ["<li>A<ul><li>B</li></ul></li>", "<li><p>A</p><p>B</p></li>"],
  ])("takes %j as different from %j", (a, b) => expect(itemState(a, b, null)).toBe("differs"));
});

describe("fieldsState", () => {
  it.each(cases)("%s against %s from %s is %s", (cv, library, base, state) =>
    expect(fieldsState(cv && fields(cv), library && fields(library), base && fields(base))).toBe(state));

  it("compares fields as the server would store them", () => {
    const a = fields(" A  b ", { role: "", description: " x ", current: true, end_date: "2024-01-01" });
    expect(fieldsState(a, fields("A b", { description: "x", current: true }), null)).toBe("same");
  });

  it.each(["role", "organization", "location", "start_date", "end_date", "description"] as const)("compares %s", (key) =>
    expect(fieldsState(fields("A", { [key]: "2024-01-01" }), fields("A"), null)).toBe("differs"));

  it("compares current and ignores everything else", () => {
    expect(fieldsState(fields("A", { current: true }), fields("A"), null)).toBe("differs");
    expect(fieldsState({ ...fields("A"), id: "x", hidden: true } as EntryFields, fields("A"), null)).toBe("same");
  });
});

describe("actionsFor", () => {
  it.each([
    ["same", []],
    ["library_only", []],
    ["cv_changed", ["to_library"]],
    ["cv_only", ["to_library"]],
    ["library_changed", ["to_cv"]],
    ["both_changed", ["to_library", "to_cv", "keep"]],
    ["differs", ["to_library", "to_cv", "keep"]],
  ] as const)("%s offers %j", (state, actions) => expect(actionsFor(state)).toEqual(actions));

  it("names them", () => {
    expect(actionLabel("cv_only", "to_library")).toBe("Add to library");
    expect(actionsFor("differs").map((action) => actionLabel("differs", action))).toEqual([
      "Update library too",
      "Use library version",
      "Keep both as they are",
    ]);
  });
});

describe("differingFields", () => {
  it("lists what differs, as shown", () =>
    expect(
      differingFields(
        fields("A ", { role: "Dev", start_date: "2024-01-01", end_date: "2024-03-01" }),
        fields("A", { location: "Leeds", start_date: "2024-02-01", current: true })
      )
    ).toEqual([
      { label: "Role", cv: "Dev", library: "" },
      { label: "Location", cv: "", library: "Leeds" },
      { label: "Start", cv: "Jan 2024", library: "Feb 2024" },
      { label: "End", cv: "Mar 2024", library: "Present" },
    ]));

  it("takes an end month beside Present as none", () =>
    expect(differingFields(fields("A", { current: true, end_date: "2024-01-01" }), fields("A", { current: true }))).toEqual([]));
});
