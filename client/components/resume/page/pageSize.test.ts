import { describe, expect, it } from "vitest";
import { resolveDesign } from "@/lib/resume/design";
import { pageMetrics, pageWidth, sheetsHeight } from "./pageSize";

// As Chrome laid out print, measured with container queries.
describe("the printed page", () => {
  it.each([
    ["a4", "classic", 16, 18, 658, 1001],
    ["a4", "classic", 10, 10, 719, 1046],
    ["letter", "classic", 10, 25, 628, 980],
    ["letter", "classic", 25, 25, 628, 867],
  ] as const)("%s %s %d %d", (paper, template, margin_y, margin_x, width, height) => {
    const design = resolveDesign({ template, margin_y, margin_x });
    const margins = 2 * ((margin_x * 96) / 25.4);
    expect(pageWidth(design, paper) - margins).toBeCloseTo(width);
    expect(pageMetrics(design, paper).pageHeight).toBe(height);
  });

  it("has the margins inside the columns of a template without any", () => {
    const design = resolveDesign({ template: "sidebar", margin_y: 10 });
    expect(pageWidth(design, "a4")).toBe(794);
    expect(pageMetrics(design, "a4").pageHeight).toBeCloseTo(1122 - 2 * ((10 * 96) / 25.4));
  });

  it("has gaps only between sheets", () => {
    const metrics = pageMetrics(resolveDesign({}), "letter");
    expect(sheetsHeight(1, metrics)).toBe(1056);
    expect(sheetsHeight(3, metrics)).toBe(3 * 1056 + 2 * metrics.gap);
  });
});
