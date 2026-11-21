import { describe, expect, it } from "vitest";
import { sidebarPages } from "./sidebarPages";

// A4 at 96 dpi is about 1122.5px tall; 16mm margins are about 60.5px each.
const a4 = (contentPx: number, marginY = 16) => sidebarPages({ contentPx, paper: "a4", marginYmm: marginY });

describe("sidebarPages", () => {
  it("is one page for a sidebar that fits on the first page", () => {
    expect(a4(0)).toBe(1);
    expect(a4(500)).toBe(1);
    expect(a4(1000)).toBe(1);
  });

  it("counts a page for each page's worth of content, after its top and bottom margins", () => {
    expect(a4(1002)).toBe(2);
    expect(a4(1950)).toBe(2);
    expect(a4(2050)).toBe(3);
  });

  it("leaves more room per page with smaller margins", () => {
    expect(a4(1030, 16)).toBe(2);
    expect(a4(1030, 10)).toBe(1);
  });

  it("uses the Letter page height for Letter paper", () => {
    // Letter is 1056px tall: 935px of content per page with 16mm margins.
    expect(sidebarPages({ contentPx: 950, paper: "letter", marginYmm: 16 })).toBe(2);
    expect(sidebarPages({ contentPx: 930, paper: "letter", marginYmm: 16 })).toBe(1);
  });
});
