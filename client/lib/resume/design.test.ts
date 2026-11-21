import { describe, expect, it } from "vitest";
import {
  applyPreset,
  contrastWithWhite,
  DESIGN_DEFAULTS,
  designStyle,
  headingColor,
  matchingPreset,
  pageMargin,
  resolveDesign,
  sheetPadding,
} from "./design";

const fonts = { source_sans: "SourceSans", plex_sans: "Plex", source_serif: "SourceSerif", lora: "Lora" };

describe("resolveDesign", () => {
  it("uses the defaults for a resume without a design", () => {
    expect(resolveDesign({})).toEqual(DESIGN_DEFAULTS);
  });

  it("keeps valid values and replaces invalid ones per key", () => {
    expect(resolveDesign({ paper: "a4", font: "lora", size: "huge", accent: "red", heading_rule: "bar" })).toEqual({
      ...DESIGN_DEFAULTS,
      font: "lora",
      heading_rule: "bar",
    });
  });

  it("splits the combined heading style older designs saved into text and line", () => {
    expect(resolveDesign({ heading_style: "caps_rule" })).toMatchObject({ heading_case: "caps", heading_rule: "under" });
    expect(resolveDesign({ heading_style: "bold" })).toMatchObject({ heading_case: "as_typed", heading_rule: "none" });
    expect(resolveDesign({ heading_style: "accent_bar" })).toMatchObject({ heading_case: "caps", heading_rule: "bar" });
  });

  it("prefers the separate heading settings over the old combined one", () => {
    expect(resolveDesign({ heading_style: "bold", heading_case: "caps", heading_rule: "bar" })).toMatchObject({
      heading_case: "caps",
      heading_rule: "bar",
    });
  });

  it("accepts a custom hex accent", () => {
    expect(resolveDesign({ accent: "#1F4E79" }).accent).toBe("#1f4e79");
  });
});

describe("resolveDesign template", () => {
  it("is Classic unless a known template is stored", () => {
    expect(resolveDesign({}).template).toBe("classic");
    expect(resolveDesign({ template: "sidebar" }).template).toBe("sidebar");
    expect(resolveDesign({ template: "fancy" }).template).toBe("classic");
  });
});

describe("resolveDesign fine-tune values", () => {
  it("matches the original Classic look by default", () => {
    expect(resolveDesign({})).toMatchObject({
      body_size: 10.5,
      name_size: 22,
      heading_size: 9,
      title_size: 11.5,
      meta_size: 10.5,
      line_height: 1.35,
      section_gap: 14,
      heading_gap: 6,
      paragraph_gap: 3,
      margin_y: 16,
      margin_x: 18,
    });
  });

  it("takes values from the size and spacing presets of a resume saved before fine-tuning", () => {
    expect(resolveDesign({ size: "large", spacing: "compact" })).toMatchObject({
      body_size: 11.5,
      name_size: 24,
      heading_size: 10,
      title_size: 12.5,
      meta_size: 11.5,
      line_height: 1.25,
      section_gap: 10,
      heading_gap: 4,
      paragraph_gap: 2,
    });
  });

  it("prefers a stored value over the preset's", () => {
    const design = resolveDesign({ size: "large", body_size: 11, line_height: 1.5 });
    expect(design.body_size).toBe(11);
    expect(design.name_size).toBe(24);
    expect(design.line_height).toBe(1.5);
  });

  it("falls back to the preset's value for one out of range, off its step or not a number", () => {
    const design = resolveDesign({ body_size: 30, name_size: 22.3, title_size: "12", margin_x: null });
    expect(design).toMatchObject({ body_size: 10.5, name_size: 22, title_size: 11.5, margin_x: 18 });
  });
});

describe("presets", () => {
  it("sets every size the preset covers, overwriting fine-tuned ones", () => {
    const tuned = { ...DESIGN_DEFAULTS, body_size: 11, name_size: 28 };
    expect(applyPreset(tuned, "size", "small")).toMatchObject({
      size: "small",
      body_size: 9.5,
      name_size: 20,
      heading_size: 8,
      title_size: 10.5,
      meta_size: 9.5,
    });
  });

  it("leaves values outside the preset alone", () => {
    const tuned = { ...DESIGN_DEFAULTS, margin_x: 12, body_size: 11 };
    expect(applyPreset(tuned, "spacing", "relaxed")).toMatchObject({ spacing: "relaxed", margin_x: 12, body_size: 11, line_height: 1.45 });
  });

  it("names the preset the current values match, or none once one is fine-tuned", () => {
    expect(matchingPreset(DESIGN_DEFAULTS, "size")).toBe("medium");
    expect(matchingPreset(applyPreset(DESIGN_DEFAULTS, "spacing", "compact"), "spacing")).toBe("compact");
    expect(matchingPreset({ ...DESIGN_DEFAULTS, body_size: 11 }, "size")).toBeNull();
  });
});

describe("designStyle", () => {
  it("maps the design to CSS variables", () => {
    const design = { ...applyPreset(applyPreset(DESIGN_DEFAULTS, "size", "large"), "spacing", "compact"), accent: "#2f6f4f", font: "lora" as const };
    const style = designStyle(design, fonts) as Record<string, string>;

    expect(style).toMatchObject({
      "--rc-size": "11.5pt",
      "--rc-name-size": "24pt",
      "--rc-heading-size": "10pt",
      "--rc-title-size": "12.5pt",
      "--rc-meta-size": "11.5pt",
      "--rc-line": "1.25",
      "--rc-section-gap": "10pt",
      "--rc-heading-gap": "4pt",
      "--rc-gap": "0.6667",
      "--rc-accent": "#2f6f4f",
      "--rc-font": "Lora",
    });
  });

  it("matches the original look by default", () => {
    expect(designStyle(DESIGN_DEFAULTS, fonts)).toMatchObject({ "--rc-size": "10.5pt", "--rc-gap": "1", "--rc-line": "1.35", "--rc-section-gap": "14pt" });
  });
});

describe("full-bleed Sidebar pages", () => {
  const sidebar = { ...DESIGN_DEFAULTS, template: "sidebar" as const, margin_y: 14, margin_x: 20 };

  it("prints with no page margins, so the sidebar reaches every edge", () => {
    expect(pageMargin(sidebar)).toBe("0mm");
  });

  it("leaves the on-screen sheet unpadded, since the template draws the margins inside its columns", () => {
    expect(sheetPadding(sidebar)).toBe("0");
    expect(sheetPadding(DESIGN_DEFAULTS)).toBe("16mm 18mm");
  });

  it("hands the margins to the template as CSS variables", () => {
    expect(designStyle(sidebar, fonts)).toMatchObject({ "--rc-margin-y": "14mm", "--rc-margin-x": "20mm" });
  });
});

describe("pageMargin", () => {
  it("is top-and-bottom then sides, in millimetres", () => {
    expect(pageMargin(DESIGN_DEFAULTS)).toBe("16mm 18mm");
    expect(pageMargin({ ...DESIGN_DEFAULTS, margin_y: 12, margin_x: 10 })).toBe("12mm 10mm");
  });
});

describe("contrastWithWhite", () => {
  it("is high for near-black", () => {
    expect(contrastWithWhite("#1a1a1a")).toBeGreaterThan(15);
  });

  it("is very low for yellow", () => {
    expect(contrastWithWhite("#ffff00")).toBeLessThan(1.1);
  });

  it("is 1 for white", () => {
    expect(contrastWithWhite("#ffffff")).toBeCloseTo(1, 5);
  });
});

describe("headingColor", () => {
  it("is the accent mixed 82% with white for headings in capitals", () => {
    expect(headingColor({ ...DESIGN_DEFAULTS, accent: "#1a1a1a" })).toBe("#434343");
  });

  it("is the accent itself beside a side bar, so text and bar match as the old Colour bar did", () => {
    expect(headingColor({ ...DESIGN_DEFAULTS, heading_rule: "bar", accent: "#1f4e79" })).toBe("#1f4e79");
    expect(headingColor(resolveDesign({ heading_style: "accent_bar", accent: "#1f4e79" }))).toBe("#1f4e79");
  });

  it("is the accent itself for headings as typed, whatever the line", () => {
    expect(headingColor({ ...DESIGN_DEFAULTS, heading_case: "as_typed", accent: "#8a8a8a" })).toBe("#8a8a8a");
    expect(headingColor({ ...DESIGN_DEFAULTS, heading_case: "as_typed", heading_rule: "bar", accent: "#8a8a8a" })).toBe("#8a8a8a");
  });

  it("makes a mid grey too faint for headings in capitals though the raw colour passes", () => {
    const design = { ...DESIGN_DEFAULTS, accent: "#8a8a8a" };
    expect(contrastWithWhite(design.accent)).toBeGreaterThan(3);
    expect(contrastWithWhite(headingColor(design))).toBeLessThan(3);
  });
});
