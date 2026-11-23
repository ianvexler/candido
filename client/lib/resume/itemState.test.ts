import { EntryFields } from "@/lib/types";
import { describe, expect, it } from "vitest";
import { fieldsState, itemState } from "./itemState";

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
  ])("takes %j as the same as %j", (a, b) => expect(itemState(a, b, null)).toBe("same"));

  it.each([
    ["<p>A b</p>", "<p>Ab</p>"],
    ["<p>A <strong>b</strong></p>", "<p>A<strong>b</strong></p>"],
    ["<p>A</p>", "<p><em>A</em></p>"],
    ["<p>A</p>", "<h2>A</h2>"],
    ["<p>A&nbsp;b</p>", "<p>A b</p>"],
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
