import { describe, expect, it } from "vitest";
import { contrastWithWhite, DESIGN_DEFAULTS, designStyle, resolveDesign } from "./design";

const fonts = { source_sans: "SourceSans", plex_sans: "Plex", source_serif: "SourceSerif", lora: "Lora" };

describe("resolveDesign", () => {
  it("uses the defaults for a resume without a design", () => {
    expect(resolveDesign({})).toEqual(DESIGN_DEFAULTS);
  });

  it("keeps valid values and replaces invalid ones per key", () => {
    expect(resolveDesign({ paper: "a4", font: "lora", size: "huge", accent: "red", heading_style: "bold" })).toEqual({
      ...DESIGN_DEFAULTS,
      font: "lora",
      heading_style: "bold",
    });
  });

  it("accepts a custom hex accent", () => {
    expect(resolveDesign({ accent: "#1F4E79" }).accent).toBe("#1f4e79");
  });
});

describe("designStyle", () => {
  it("maps size, spacing, accent and font to CSS variables", () => {
    const style = designStyle(
      { ...DESIGN_DEFAULTS, size: "large", spacing: "compact", accent: "#2f6f4f", font: "lora" },
      fonts
    ) as Record<string, string>;

    expect(style).toMatchObject({
      "--rc-size": "11.5pt",
      "--rc-gap": "0.7",
      "--rc-line": "1.25",
      "--rc-accent": "#2f6f4f",
      "--rc-font": "Lora",
    });
  });

  it("matches the original look by default", () => {
    expect(designStyle(DESIGN_DEFAULTS, fonts)).toMatchObject({ "--rc-size": "10.5pt", "--rc-gap": "1", "--rc-line": "1.35" });
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
