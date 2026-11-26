import { describe, expect, it } from "vitest";
import { isBareRoute, safeRedirectPath } from "./routes";

describe("isBareRoute", () => {
  it("matches a resume's print page", () => {
    expect(isBareRoute("/resume/12/print")).toBe(true);
  });

  it.each(["/resume/12", "/resume/sections", "/resume/12/print/x", "/board"])("does not match %s", (path) => {
    expect(isBareRoute(path)).toBe(false);
  });
});

describe("safeRedirectPath", () => {
  it.each(["/board/12?from=sheet", "/"])("keeps %s", (from) => {
    expect(safeRedirectPath(from, "/dashboard")).toBe(from);
  });

  it.each([null, "", "https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "board"])(
    "falls back for %s",
    (from) => {
      expect(safeRedirectPath(from, "/dashboard")).toBe("/dashboard");
    }
  );
});
