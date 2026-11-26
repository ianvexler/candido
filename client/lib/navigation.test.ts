import { describe, expect, it } from "vitest";
import { applicationsItem, boardItem, cvsItem, dashboardItem, sectionLibraryItem } from "./navigation";

describe("nav items", () => {
  it.each(["/board", "/board/12"])("marks only Board active on %s", (path) => {
    expect(boardItem.isActive(path)).toBe(true);
    expect(applicationsItem.isActive(path)).toBe(false);
  });

  it("marks only Applications active on its page", () => {
    expect(applicationsItem.isActive("/applications")).toBe(true);
    expect(boardItem.isActive("/applications")).toBe(false);
  });

  it.each(["/resume", "/resume/12"])("marks CVs active on %s", (path) => {
    expect(cvsItem.isActive(path)).toBe(true);
    expect(sectionLibraryItem.isActive(path)).toBe(false);
  });

  it("marks only the section library active on its page", () => {
    expect(sectionLibraryItem.isActive("/resume/sections")).toBe(true);
    expect(cvsItem.isActive("/resume/sections")).toBe(false);
  });

  it("does not match paths that only share a prefix", () => {
    expect(boardItem.isActive("/boards")).toBe(false);
    expect(dashboardItem.isActive("/dashboards")).toBe(false);
  });
});
