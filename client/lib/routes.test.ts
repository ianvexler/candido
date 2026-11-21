import { describe, expect, it } from "vitest";
import { isBareRoute } from "./routes";

describe("isBareRoute", () => {
  it("matches a resume's print page", () => {
    expect(isBareRoute("/resume/12/print")).toBe(true);
  });

  it.each(["/resume/12", "/resume/sections", "/resume/12/print/x", "/board"])("does not match %s", (path) => {
    expect(isBareRoute(path)).toBe(false);
  });
});
