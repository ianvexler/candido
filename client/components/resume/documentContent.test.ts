import { afterEach, describe, expect, it, vi } from "vitest";
import { hasVisibleText, stripHiddenHtml } from "./documentContent";

afterEach(() => vi.unstubAllGlobals());

describe("stripHiddenHtml", () => {
  it("removes hidden text and keeps the rest", () => {
    const html = stripHiddenHtml('<p>Led <span data-cv-hidden="true">quietly</span> work</p>');

    expect(html).toContain("Led");
    expect(html).toContain("work");
    expect(html).not.toContain("quietly");
  });

  it("drops bullets and lists left empty once hidden text is gone", () => {
    const html = stripHiddenHtml('<ul><li><p><span data-cv-hidden="true">x</span></p></li></ul><p>Kept</p>');

    expect(html).toBe("<p>Kept</p>");
  });

  it("keeps an item marked as ticked", () => {
    expect(stripHiddenHtml('<p data-cv-off="false">Kept</p>')).toContain("Kept");
  });

  it("refuses unticked items without a DOM", () => {
    vi.stubGlobal("window", undefined);

    expect(() => stripHiddenHtml('<p data-cv-off="true">x</p>')).toThrow();
    expect(stripHiddenHtml("<p>Kept</p>")).toBe("<p>Kept</p>");
  });
});

describe("hasVisibleText", () => {
  it("is false when all text is hidden", () => {
    expect(hasVisibleText('<p><span data-cv-hidden="true">x</span></p>')).toBe(false);
  });
});
