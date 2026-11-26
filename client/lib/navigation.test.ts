import { describe, expect, it } from "vitest";
import { cvsItem, dashboardItem, jobsItem, sectionLibraryItem } from "./navigation";

describe("nav items", () => {
  it.each(["/board", "/board/12", "/sheet"])("marks Jobs active on %s", (path) => {
    expect(jobsItem.isActive(path)).toBe(true);
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
    expect(jobsItem.isActive("/boards")).toBe(false);
    expect(dashboardItem.isActive("/dashboards")).toBe(false);
  });
});
